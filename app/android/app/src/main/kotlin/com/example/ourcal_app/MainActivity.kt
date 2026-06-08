package com.example.ourcal_app

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, WIDGET_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "saveMonthlyCalendarSnapshot" -> {
                    val snapshotJson = call.arguments as? String
                    if (snapshotJson.isNullOrBlank()) {
                        result.error("INVALID_ARGUMENT", "Calendar snapshot is empty.", null)
                        return@setMethodCallHandler
                    }

                    getSharedPreferences(WIDGET_PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_MONTHLY_SNAPSHOT, snapshotJson)
                        .apply()

                    refreshMonthCalendarWidgets()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun refreshMonthCalendarWidgets() {
        val manager = AppWidgetManager.getInstance(this)
        val component = ComponentName(this, MonthCalendarWidgetProvider::class.java)
        val ids = manager.getAppWidgetIds(component)
        if (ids.isNotEmpty()) {
            MonthCalendarWidgetProvider.updateWidgets(this, manager, ids)
        }
    }

    companion object {
        const val WIDGET_CHANNEL = "ourcal/widget"
        const val WIDGET_PREFS = "ourcal_widget"
        const val KEY_MONTHLY_SNAPSHOT = "monthly_calendar_snapshot"
    }
}
