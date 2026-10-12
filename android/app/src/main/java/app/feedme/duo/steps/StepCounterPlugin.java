package app.feedme.duo.steps;

import android.Manifest;
import android.content.Context;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.concurrent.TimeUnit;

/**
 * Compte les pas avec le capteur du téléphone, comme les applis de podomètre :
 * pas besoin de Samsung Health ni de Health Connect.
 */
@CapacitorPlugin(
    name = "StepCounter",
    permissions = { @Permission(alias = "activity", strings = { Manifest.permission.ACTIVITY_RECOGNITION }) }
)
public class StepCounterPlugin extends Plugin {
    private static final String WORK_NAME = "feedme-steps";

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", StepSensor.isAvailable(getContext()));
        result.put("granted", StepWorker.hasPermission(getContext()));
        call.resolve(result);
    }

    /** Demande l'autorisation « Activité physique » (Android 10 et plus). */
    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (StepWorker.hasPermission(getContext())) {
            resolveGranted(call, true);
            return;
        }
        requestPermissionForAlias("activity", call, "accessCallback");
    }

    @PermissionCallback
    private void accessCallback(PluginCall call) {
        resolveGranted(call, getPermissionState("activity") == PermissionState.GRANTED);
    }

    private void resolveGranted(PluginCall call, boolean granted) {
        JSObject result = new JSObject();
        result.put("granted", granted);
        call.resolve(result);
    }

    /** Programme le relevé en arrière-plan (toutes les 15 min environ) et renvoie les pas. */
    @PluginMethod
    public void start(PluginCall call) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(StepWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        getSteps(call);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        WorkManager.getInstance(getContext()).cancelUniqueWork(WORK_NAME);
        call.resolve();
    }

    /** Relève le capteur maintenant, puis renvoie les pas par jour : { days: { "2026-10-12": 6840, … } }. */
    @PluginMethod
    public void getSteps(PluginCall call) {
        Context context = getContext();
        new Thread(() -> {
            if (StepWorker.hasPermission(context)) {
                float raw = StepSensor.read(context);
                if (raw >= 0) StepStore.record(context, raw);
            }
            JSObject result = new JSObject();
            result.put("days", StepStore.days(context));
            call.resolve(result);
        }, "feedme-steps-read").start();
    }
}
