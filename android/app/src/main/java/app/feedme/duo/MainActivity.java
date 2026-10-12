package app.feedme.duo;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

import app.feedme.duo.food.FoodClassifierPlugin;
import app.feedme.duo.steps.StepCounterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Module propre à l'app : doit être enregistré avant le démarrage du pont Capacitor.
        registerPlugin(StepCounterPlugin.class);
        registerPlugin(FoodClassifierPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
