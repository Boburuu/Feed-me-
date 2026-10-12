package app.feedme.duo.steps;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Pas par jour, calculés à partir du capteur matériel « step counter ».
 *
 * Le capteur donne un total depuis le dernier démarrage du téléphone. À chaque relevé,
 * on ajoute la différence avec le relevé précédent au jour en cours. Si le total a
 * baissé, le téléphone a redémarré : tout le total actuel est nouveau.
 */
public final class StepStore {
    private static final String PREFS = "feedme_steps";
    private static final String LAST_RAW = "lastRaw";
    private static final String DAYS = "days";
    private static final int KEEP_DAYS = 90;

    private StepStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Enregistre un relevé du capteur. Synchronisé : l'app et la tâche de fond peuvent relever en même temps. */
    public static synchronized void record(Context context, float raw) {
        SharedPreferences prefs = prefs(context);
        float lastRaw = prefs.getFloat(LAST_RAW, -1f);
        JSONObject days = readDays(prefs);
        String today = LocalDate.now().toString();

        long delta;
        if (lastRaw < 0) {
            // Premier relevé : si le téléphone a démarré aujourd'hui, tout le total est d'aujourd'hui.
            long sinceMidnight = LocalTime.now().toSecondOfDay() * 1000L;
            delta = SystemClock.elapsedRealtime() < sinceMidnight ? (long) raw : 0;
        } else if (raw < lastRaw) {
            delta = (long) raw; // redémarrage du téléphone
        } else {
            delta = (long) (raw - lastRaw);
        }

        try {
            days.put(today, days.optLong(today, 0) + delta);
            prune(days);
        } catch (JSONException ignored) {
            // JSONObject.put ne lève pas d'erreur pour une chaîne et un nombre.
        }
        prefs.edit().putFloat(LAST_RAW, raw).putString(DAYS, days.toString()).apply();
    }

    public static synchronized JSONObject days(Context context) {
        return readDays(prefs(context));
    }

    private static JSONObject readDays(SharedPreferences prefs) {
        try {
            return new JSONObject(prefs.getString(DAYS, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    private static void prune(JSONObject days) {
        String oldest = LocalDate.now().minusDays(KEEP_DAYS).toString();
        List<String> old = new ArrayList<>();
        for (Iterator<String> keys = days.keys(); keys.hasNext(); ) {
            String key = keys.next();
            if (key.compareTo(oldest) < 0) old.add(key);
        }
        for (String key : old) days.remove(key);
    }
}
