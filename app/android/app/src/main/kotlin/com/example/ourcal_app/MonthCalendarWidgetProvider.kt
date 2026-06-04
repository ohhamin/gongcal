package com.example.ourcal_app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

class MonthCalendarWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { appWidgetId ->
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        if (intent.action in dateRefreshActions) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, MonthCalendarWidgetProvider::class.java)
            onUpdate(context, manager, manager.getAppWidgetIds(component))
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
    ) {
        val views = RemoteViews(context.packageName, R.layout.month_calendar_widget)
        val now = Calendar.getInstance(Locale.KOREA)
        val year = now.get(Calendar.YEAR)
        val month = now.get(Calendar.MONTH)
        val today = now.get(Calendar.DAY_OF_MONTH)

        views.setTextViewText(R.id.widget_title, SimpleDateFormat("yyyy년 M월", Locale.KOREA).format(now.time))
        views.setTextViewText(R.id.widget_subtitle, "이번 달")
        views.setOnClickPendingIntent(R.id.widget_root, createOpenAppPendingIntent(context))

        val firstDay = Calendar.getInstance(Locale.KOREA).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month)
            set(Calendar.DAY_OF_MONTH, 1)
        }
        val firstColumn = firstDay.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
        val daysInMonth = firstDay.getActualMaximum(Calendar.DAY_OF_MONTH)

        for (index in 0 until 42) {
            val row = index / 7
            val column = index % 7
            val day = index - firstColumn + 1
            val viewId = dayCellIds[row][column]

            if (day in 1..daysInMonth) {
                views.setTextViewText(viewId, day.toString())
                val isToday = day == today
                views.setTextColor(viewId, dayTextColor(column, isToday))
                views.setInt(viewId, "setBackgroundResource", if (isToday) R.drawable.widget_today_bg else R.drawable.widget_day_cell_bg)
            } else {
                views.setTextViewText(viewId, "")
                views.setTextColor(viewId, Color.TRANSPARENT)
                views.setInt(viewId, "setBackgroundResource", R.drawable.widget_day_cell_bg)
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun createOpenAppPendingIntent(context: Context): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(context, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)

        val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE
        } else {
            0
        }

        return PendingIntent.getActivity(context, 0, intent, flags)
    }

    private fun dayTextColor(column: Int, isToday: Boolean): Int {
        if (isToday) return Color.WHITE
        return when (column) {
            0 -> Color.parseColor("#E34545")
            6 -> Color.parseColor("#3656C2")
            else -> Color.parseColor("#111122")
        }
    }

    companion object {
        private val dateRefreshActions = setOf(
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
        )

        private val dayCellIds = arrayOf(
            intArrayOf(R.id.day_0_0, R.id.day_0_1, R.id.day_0_2, R.id.day_0_3, R.id.day_0_4, R.id.day_0_5, R.id.day_0_6),
            intArrayOf(R.id.day_1_0, R.id.day_1_1, R.id.day_1_2, R.id.day_1_3, R.id.day_1_4, R.id.day_1_5, R.id.day_1_6),
            intArrayOf(R.id.day_2_0, R.id.day_2_1, R.id.day_2_2, R.id.day_2_3, R.id.day_2_4, R.id.day_2_5, R.id.day_2_6),
            intArrayOf(R.id.day_3_0, R.id.day_3_1, R.id.day_3_2, R.id.day_3_3, R.id.day_3_4, R.id.day_3_5, R.id.day_3_6),
            intArrayOf(R.id.day_4_0, R.id.day_4_1, R.id.day_4_2, R.id.day_4_3, R.id.day_4_4, R.id.day_4_5, R.id.day_4_6),
            intArrayOf(R.id.day_5_0, R.id.day_5_1, R.id.day_5_2, R.id.day_5_3, R.id.day_5_4, R.id.day_5_5, R.id.day_5_6),
        )
    }
}
