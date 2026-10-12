package app.feedme.duo.food;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.tensorflow.lite.DataType;
import org.tensorflow.lite.Interpreter;
import org.tensorflow.lite.Tensor;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Reconnaissance de plats sur une photo, sur le téléphone et hors ligne.
 * Modèle « AIY Vision Classifier Food V1 » de Google (Apache 2.0), ~2 000 plats.
 * Il propose des noms de plats probables, pas des quantités.
 */
@CapacitorPlugin(name = "FoodClassifier")
public class FoodClassifierPlugin extends Plugin {
    private static final String MODEL = "food/aiy_food_v1.tflite";
    private static final String LABELS = "food/aiy_food_v1_labels.csv";

    private static Interpreter interpreter;
    private static List<String> labels;

    /** Chargés à la première photo seulement : le modèle pèse 21 Mo. */
    private static synchronized void load(Context context) throws Exception {
        if (interpreter != null) return;
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (InputStream in = context.getAssets().open(MODEL)) {
            byte[] chunk = new byte[1 << 16];
            int read;
            while ((read = in.read(chunk)) != -1) bytes.write(chunk, 0, read);
        }
        ByteBuffer model = ByteBuffer.allocateDirect(bytes.size()).order(ByteOrder.nativeOrder());
        model.put(bytes.toByteArray());
        model.rewind();
        Interpreter.Options options = new Interpreter.Options().setNumThreads(4);
        interpreter = new Interpreter(model, options);

        labels = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(context.getAssets().open(LABELS), StandardCharsets.UTF_8))) {
            reader.readLine(); // en-tête « id,name »
            String line;
            while ((line = reader.readLine()) != null) {
                int comma = line.indexOf(',');
                labels.add(comma >= 0 ? line.substring(comma + 1) : line);
            }
        }
    }

    /** classify({ path }) → { results: [{ label, score }] }, du plus probable au moins probable. */
    @PluginMethod
    public void classify(PluginCall call) {
        String path = call.getString("path");
        if (path == null) {
            call.reject("Chemin de l'image manquant");
            return;
        }
        Context context = getContext();
        new Thread(() -> {
            try {
                load(context);
                Bitmap bitmap;
                try (InputStream in = context.getContentResolver().openInputStream(Uri.parse(path))) {
                    bitmap = BitmapFactory.decodeStream(in);
                }
                if (bitmap == null) {
                    call.reject("Image illisible");
                    return;
                }
                float[] scores = run(bitmap);
                bitmap.recycle();
                call.resolve(top(scores, call.getInt("limit", 5)));
            } catch (Exception e) {
                call.reject("Analyse impossible : " + e.getMessage(), e);
            }
        }, "feedme-food").start();
    }

    private static synchronized float[] run(Bitmap source) {
        Tensor input = interpreter.getInputTensor(0);
        int[] shape = input.shape(); // [1, hauteur, largeur, 3]
        int height = shape[1];
        int width = shape[2];

        // Recadrage carré au centre (l'assiette est en général au milieu), puis redimensionnement.
        int side = Math.min(source.getWidth(), source.getHeight());
        Bitmap square = Bitmap.createBitmap(source, (source.getWidth() - side) / 2, (source.getHeight() - side) / 2, side, side);
        Bitmap scaled = Bitmap.createScaledBitmap(square, width, height, true);
        int[] pixels = new int[width * height];
        scaled.getPixels(pixels, 0, width, 0, 0, width, height);

        boolean floatInput = input.dataType() == DataType.FLOAT32;
        ByteBuffer buffer = ByteBuffer.allocateDirect(width * height * 3 * (floatInput ? 4 : 1)).order(ByteOrder.nativeOrder());
        for (int pixel : pixels) {
            int r = (pixel >> 16) & 0xFF, g = (pixel >> 8) & 0xFF, b = pixel & 0xFF;
            if (floatInput) {
                buffer.putFloat(r / 255f).putFloat(g / 255f).putFloat(b / 255f);
            } else {
                buffer.put((byte) r).put((byte) g).put((byte) b);
            }
        }
        buffer.rewind();

        Tensor output = interpreter.getOutputTensor(0);
        int count = output.shape()[output.shape().length - 1];
        float[] scores = new float[count];
        if (output.dataType() == DataType.FLOAT32) {
            float[][] result = new float[1][count];
            interpreter.run(buffer, result);
            scores = result[0];
        } else {
            byte[][] result = new byte[1][count];
            interpreter.run(buffer, result);
            float scale = output.quantizationParams().getScale();
            int zero = output.quantizationParams().getZeroPoint();
            for (int i = 0; i < count; i++) scores[i] = ((result[0][i] & 0xFF) - zero) * scale;
        }
        if (square != source) square.recycle();
        scaled.recycle();
        return scores;
    }

    private static JSObject top(float[] scores, int limit) {
        List<Integer> best = new ArrayList<>();
        for (int i = 1; i < scores.length; i++) { // 0 = « __background__ »
            if (i >= labels.size() || labels.get(i).startsWith("/")) continue; // identifiants sans nom
            best.add(i);
        }
        best.sort((a, b) -> Float.compare(scores[b], scores[a]));
        JSArray results = new JSArray();
        for (int i = 0; i < Math.min(limit, best.size()); i++) {
            int index = best.get(i);
            JSObject item = new JSObject();
            item.put("label", labels.get(index));
            item.put("score", scores[index]);
            results.put(item);
        }
        JSObject response = new JSObject();
        response.put("results", results);
        return response;
    }
}
