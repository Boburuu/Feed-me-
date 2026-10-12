package app.feedme.duo.steps;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Lecture ponctuelle du capteur de pas : on s'abonne, on prend la première valeur, on se désabonne. */
public final class StepSensor {
    private StepSensor() {}

    public static boolean isAvailable(Context context) {
        SensorManager manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        return manager != null && manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) != null;
    }

    /**
     * Total de pas depuis le démarrage du téléphone, ou -1 si le capteur ne répond pas.
     * Bloquant (jusqu'à 10 s) : à appeler hors du fil principal.
     */
    public static float read(Context context) {
        SensorManager manager = (SensorManager) context.getSystemService(Context.SENSOR_SERVICE);
        Sensor sensor = manager == null ? null : manager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER);
        if (sensor == null) return -1f;

        final float[] value = { -1f };
        final CountDownLatch latch = new CountDownLatch(1);
        HandlerThread thread = new HandlerThread("feedme-steps");
        thread.start();
        SensorEventListener listener = new SensorEventListener() {
            @Override
            public void onSensorChanged(SensorEvent event) {
                value[0] = event.values[0];
                latch.countDown();
            }

            @Override
            public void onAccuracyChanged(Sensor s, int accuracy) {}
        };
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL, new Handler(thread.getLooper()));
        try {
            latch.await(10, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            manager.unregisterListener(listener);
            thread.quitSafely();
        }
        return value[0];
    }
}
