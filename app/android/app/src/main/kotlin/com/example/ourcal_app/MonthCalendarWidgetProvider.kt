package com.example.ourcal_app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.view.View
import android.widget.RemoteViews
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject
import org.xmlpull.v1.XmlPullParser

class MonthCalendarWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        updateWidgets(context, appWidgetManager, appWidgetIds)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)

        when (intent.action) {
            ACTION_PREV_MONTH -> {
                moveDisplayMonth(context, -1)
                refreshAllWidgets(context)
            }
            ACTION_NEXT_MONTH -> {
                moveDisplayMonth(context, 1)
                refreshAllWidgets(context)
            }
            ACTION_RESET_MONTH -> {
                resetDisplayMonth(context)
                refreshAllWidgets(context)
            }
            in dateRefreshActions -> refreshAllWidgets(context)
        }
    }

    private fun updateWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
    ) {
        val views = RemoteViews(context.packageName, R.layout.month_calendar_widget)
        val snapshot = readSnapshot(context)
        val now = Calendar.getInstance(Locale.KOREA)
        val displayCalendar = readDisplayMonth(context) ?: snapshot?.monthCalendar ?: now
        val year = displayCalendar.get(Calendar.YEAR)
        val month = displayCalendar.get(Calendar.MONTH)
        val todayKey = dateKey(now)
        val holidayByDate = loadFallbackHolidays(context)
        val snapshotEventsByDate = snapshot?.eventsByDate.orEmpty()

        val displayMonthKey = monthKey(displayCalendar)
        views.setTextViewText(R.id.widget_title, SimpleDateFormat("yyyy년 M월", Locale.KOREA).format(displayCalendar.time))
        views.setViewVisibility(R.id.widget_subtitle, View.GONE)
        views.setOnClickPendingIntent(R.id.widget_root, createOpenAppPendingIntent(context, displayMonthKey, "calendar"))
        views.setOnClickPendingIntent(R.id.widget_title, createOpenAppPendingIntent(context, displayMonthKey, "calendar"))
        views.setOnClickPendingIntent(R.id.widget_prev_month, createWidgetActionPendingIntent(context, ACTION_PREV_MONTH))
        views.setOnClickPendingIntent(R.id.widget_next_month, createWidgetActionPendingIntent(context, ACTION_NEXT_MONTH))
        views.setOnClickPendingIntent(R.id.widget_filter_my, createOpenAppPendingIntent(context, displayMonthKey, "calendar"))
        views.setOnClickPendingIntent(R.id.widget_filter_group, createOpenAppPendingIntent(context, displayMonthKey, "calendar"))
        views.setOnClickPendingIntent(R.id.widget_group_settings, createOpenAppPendingIntent(context, displayMonthKey, "groups"))

        val firstDay = Calendar.getInstance(Locale.KOREA).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month)
            set(Calendar.DAY_OF_MONTH, 1)
        }
        val firstColumn = firstDay.get(Calendar.DAY_OF_WEEK) - Calendar.SUNDAY
        val daysInMonth = firstDay.getActualMaximum(Calendar.DAY_OF_MONTH)

        for (index in 0 until 35) {
            val row = index / 7
            val column = index % 7
            val day = index - firstColumn + 1
            val numberViewId = dayNumberIds[row][column]
            val eventViewIds = eventLabelIds[row][column]

            views.setInt(dayCellIds[row][column], "setBackgroundResource", R.drawable.widget_grid_cell_bg)
            clearEventSlots(views, eventViewIds)

            if (day in 1..daysInMonth) {
                val currentDateKey = "%04d-%02d-%02d".format(Locale.US, year, month + 1, day)
                val holiday = snapshotEventsByDate[currentDateKey]?.firstOrNull { it.isHoliday }?.title
                    ?: holidayByDate[currentDateKey]
                val dayEvents = snapshotEventsByDate[currentDateKey].orEmpty().filterNot { it.isHoliday }
                val isToday = currentDateKey == todayKey
                val isRedDay = holiday != null || column == 0 || column == 6

                views.setViewVisibility(numberViewId, View.VISIBLE)
                views.setTextViewText(numberViewId, day.toString())
                views.setTextColor(
                    numberViewId,
                    when {
                        isToday -> Color.WHITE
                        isRedDay -> RED_DAY_COLOR
                        else -> TEXT_COLOR
                    },
                )
                views.setInt(
                    numberViewId,
                    "setBackgroundResource",
                    if (isToday) R.drawable.widget_today_number_bg else R.drawable.widget_day_number_bg,
                )

                renderEvents(views, eventViewIds, holiday, dayEvents)
            } else {
                views.setTextViewText(numberViewId, "")
                views.setTextColor(numberViewId, Color.TRANSPARENT)
                views.setInt(numberViewId, "setBackgroundResource", R.drawable.widget_day_number_bg)
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun clearEventSlots(views: RemoteViews, eventViewIds: IntArray) {
        eventViewIds.forEach { eventViewId ->
            views.setTextViewText(eventViewId, "")
            views.setViewVisibility(eventViewId, View.GONE)
        }
    }

    private fun renderEvents(
        views: RemoteViews,
        eventViewIds: IntArray,
        holiday: String?,
        events: List<WidgetEvent>,
    ) {
        var slot = 0
        if (!holiday.isNullOrBlank() && slot < eventViewIds.size) {
            renderEventSlot(
                views = views,
                viewId = eventViewIds[slot++],
                text = holiday,
                background = R.drawable.widget_event_holiday_bg,
                textColor = RED_DAY_COLOR,
            )
        }

        val availableSlots = eventViewIds.size - slot
        val visibleEventCount = when {
            availableSlots <= 0 -> 0
            events.size > availableSlots -> availableSlots - 1
            else -> events.size.coerceAtMost(MAX_VISIBLE_EVENTS)
        }
        events.take(visibleEventCount).forEach { event ->
            val isMyColor = isSameRgb(event.color, MY_EVENT_COLOR)
            val isMine = event.isMine || isMyColor
            val background = when {
                event.isHidden && isMine -> R.drawable.widget_event_my_hidden_bg
                event.isHidden -> R.drawable.widget_event_group_hidden_bg
                event.isPendingInvite -> R.drawable.widget_event_pending_bg
                isMine -> R.drawable.widget_event_my_bg
                else -> R.drawable.widget_event_group_bg
            }
            val textColor = when {
                event.isPendingInvite -> GROUP_EVENT_COLOR
                else -> Color.WHITE
            }
            val prefix = when {
                event.isPrivateLocked -> "🔒 "
                event.isPendingInvite -> "◌ "
                else -> ""
            }
            renderEventSlot(
                views = views,
                viewId = eventViewIds[slot++],
                text = prefix + event.title.removePrefix("🔒"),
                background = background,
                textColor = textColor,
            )
        }

        val remaining = events.size - visibleEventCount
        if (remaining > 0 && slot < eventViewIds.size) {
            renderEventSlot(
                views = views,
                viewId = eventViewIds[slot],
                text = "+$remaining",
                background = R.drawable.widget_event_more_bg,
                textColor = PRIMARY_COLOR,
            )
        }
    }

    private fun renderEventSlot(
        views: RemoteViews,
        viewId: Int,
        text: String,
        background: Int,
        textColor: Int,
    ) {
        views.setViewVisibility(viewId, View.VISIBLE)
        views.setTextViewText(viewId, text)
        views.setTextColor(viewId, textColor)
        views.setInt(viewId, "setBackgroundResource", background)
    }

    private fun readSnapshot(context: Context): WidgetSnapshot? {
        val raw = context.getSharedPreferences(MainActivity.WIDGET_PREFS, Context.MODE_PRIVATE)
            .getString(MainActivity.KEY_MONTHLY_SNAPSHOT, null)
            ?: return null

        return runCatching {
            val json = JSONObject(raw)
            val monthDate = json.optString("monthDate")
            val monthCalendar = Calendar.getInstance(Locale.KOREA).apply {
                val parts = monthDate.split('-')
                set(Calendar.YEAR, parts.getOrNull(0)?.toIntOrNull() ?: get(Calendar.YEAR))
                set(Calendar.MONTH, (parts.getOrNull(1)?.toIntOrNull() ?: (get(Calendar.MONTH) + 1)) - 1)
                set(Calendar.DAY_OF_MONTH, 1)
            }

            val eventsByDate = mutableMapOf<String, MutableList<WidgetEvent>>()
            val days = json.optJSONArray("days") ?: JSONArray()
            for (index in 0 until days.length()) {
                val day = days.optJSONObject(index) ?: continue
                val date = day.optString("date")
                val events = day.optJSONArray("events") ?: JSONArray()
                for (eventIndex in 0 until events.length()) {
                    val event = events.optJSONObject(eventIndex) ?: continue
                    eventsByDate.getOrPut(date) { mutableListOf() }.add(
                        WidgetEvent(
                            title = event.optString("title").ifBlank { "일정" },
                            color = parseColor(event.optString("color"), GROUP_EVENT_COLOR),
                            isHoliday = event.optBoolean("isHoliday"),
                            isPendingInvite = event.optBoolean("isPendingInvite"),
                            isHidden = event.optBoolean("isHidden"),
                            isMine = event.optBoolean("isMine"),
                            isPrivateLocked = event.optBoolean("isPrivateLocked"),
                        ),
                    )
                }
            }

            WidgetSnapshot(monthCalendar, eventsByDate)
        }.getOrNull()
    }

    private fun loadFallbackHolidays(context: Context): Map<String, String> {
        val holidays = mutableMapOf<String, String>()
        runCatching {
            val parser = context.resources.getXml(R.xml.holiday)
            var currentName: String? = null
            var currentLocdate: String? = null
            var eventType = parser.eventType
            while (eventType != XmlPullParser.END_DOCUMENT) {
                if (eventType == XmlPullParser.START_TAG) {
                    when (parser.name) {
                        "dateName" -> currentName = parser.nextText().trim()
                        "locdate" -> currentLocdate = parser.nextText().trim()
                    }
                } else if (eventType == XmlPullParser.END_TAG && parser.name == "item") {
                    val fallbackDateKey = currentLocdate?.takeIf { it.length == 8 }?.let {
                        "${it.substring(0, 4)}-${it.substring(4, 6)}-${it.substring(6, 8)}"
                    }
                    if (!fallbackDateKey.isNullOrBlank() && !currentName.isNullOrBlank()) holidays[fallbackDateKey] = currentName!!
                    currentName = null
                    currentLocdate = null
                }
                eventType = parser.next()
            }
        }
        return holidays
    }

    private fun refreshAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, MonthCalendarWidgetProvider::class.java)
        updateWidgets(context, manager, manager.getAppWidgetIds(component))
    }

    private fun readDisplayMonth(context: Context): Calendar? {
        val rawMonth = context.getSharedPreferences(MainActivity.WIDGET_PREFS, Context.MODE_PRIVATE)
            .getString(KEY_DISPLAY_MONTH, null)
            ?: return null
        val parts = rawMonth.split('-')
        val year = parts.getOrNull(0)?.toIntOrNull() ?: return null
        val month = parts.getOrNull(1)?.toIntOrNull() ?: return null
        return Calendar.getInstance(Locale.KOREA).apply {
            set(Calendar.YEAR, year)
            set(Calendar.MONTH, month - 1)
            set(Calendar.DAY_OF_MONTH, 1)
        }
    }

    private fun moveDisplayMonth(context: Context, deltaMonth: Int) {
        val base = readDisplayMonth(context) ?: readSnapshot(context)?.monthCalendar ?: Calendar.getInstance(Locale.KOREA)
        val next = Calendar.getInstance(Locale.KOREA).apply {
            time = base.time
            set(Calendar.DAY_OF_MONTH, 1)
            add(Calendar.MONTH, deltaMonth)
        }
        context.getSharedPreferences(MainActivity.WIDGET_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_DISPLAY_MONTH, monthKey(next))
            .apply()
    }

    private fun resetDisplayMonth(context: Context) {
        context.getSharedPreferences(MainActivity.WIDGET_PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_DISPLAY_MONTH)
            .apply()
    }

    private fun createWidgetActionPendingIntent(context: Context, action: String): PendingIntent {
        val intent = Intent(context, MonthCalendarWidgetProvider::class.java).apply {
            this.action = action
        }
        return PendingIntent.getBroadcast(context, action.hashCode(), intent, pendingIntentFlags())
    }

    private fun createOpenAppPendingIntent(context: Context, targetMonth: String, route: String): PendingIntent {
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(context, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        intent.putExtra("ourcal_target_month", targetMonth)
        intent.putExtra("ourcal_target_route", route)

        return PendingIntent.getActivity(context, (targetMonth + route).hashCode(), intent, pendingIntentFlags())
    }

    private fun pendingIntentFlags(): Int {
        return PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_IMMUTABLE
        } else {
            0
        }
    }

    private fun dateKey(calendar: Calendar): String = "%04d-%02d-%02d".format(
        Locale.US,
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH),
    )

    private fun monthKey(calendar: Calendar): String = "%04d-%02d".format(
        Locale.US,
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
    )

    private fun parseColor(rawColor: String, fallback: Int): Int {
        return runCatching {
            when {
                rawColor.matches(Regex("^#[0-9A-Fa-f]{8}$")) -> {
                    val rgb = rawColor.substring(1, 7)
                    Color.parseColor("#$rgb")
                }
                rawColor.startsWith("#") -> Color.parseColor(rawColor)
                rawColor.startsWith("rgba") -> {
                    val values = rawColor.substringAfter('(').substringBefore(')').split(',').map { it.trim() }
                    Color.rgb(values[0].toInt(), values[1].toInt(), values[2].toInt())
                }
                else -> fallback
            }
        }.getOrDefault(fallback)
    }

    private fun isSameRgb(left: Int, right: Int): Boolean {
        return Color.red(left) == Color.red(right) &&
            Color.green(left) == Color.green(right) &&
            Color.blue(left) == Color.blue(right)
    }

    data class WidgetSnapshot(
        val monthCalendar: Calendar,
        val eventsByDate: Map<String, List<WidgetEvent>>,
    )

    data class WidgetEvent(
        val title: String,
        val color: Int,
        val isHoliday: Boolean,
        val isPendingInvite: Boolean,
        val isHidden: Boolean,
        val isMine: Boolean,
        val isPrivateLocked: Boolean,
    )

    companion object {
        private const val MAX_VISIBLE_EVENTS = 4
        private const val KEY_DISPLAY_MONTH = "widget_display_month"
        private const val ACTION_PREV_MONTH = "com.example.ourcal_app.widget.PREV_MONTH"
        private const val ACTION_NEXT_MONTH = "com.example.ourcal_app.widget.NEXT_MONTH"
        private const val ACTION_RESET_MONTH = "com.example.ourcal_app.widget.RESET_MONTH"
        private val TEXT_COLOR = Color.parseColor("#111122")
        private val RED_DAY_COLOR = Color.parseColor("#DC2626")
        private val PRIMARY_COLOR = Color.parseColor("#111122")
        private val MY_EVENT_COLOR = Color.parseColor("#3B82F6")
        private val GROUP_EVENT_COLOR = Color.parseColor("#10B981")
        // FullCalendar monthly event colors in web/app/calendar/page.tsx.
        // Keep widget pills visually aligned with the in-app calendar.

        private val dateRefreshActions = setOf(
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
        )

        fun updateWidgets(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetIds: IntArray,
        ) {
            appWidgetIds.forEach { appWidgetId ->
                MonthCalendarWidgetProvider().updateWidget(context, appWidgetManager, appWidgetId)
            }
        }

        private val dayCellIds = arrayOf(
            intArrayOf(R.id.day_cell_0_0, R.id.day_cell_0_1, R.id.day_cell_0_2, R.id.day_cell_0_3, R.id.day_cell_0_4, R.id.day_cell_0_5, R.id.day_cell_0_6),
            intArrayOf(R.id.day_cell_1_0, R.id.day_cell_1_1, R.id.day_cell_1_2, R.id.day_cell_1_3, R.id.day_cell_1_4, R.id.day_cell_1_5, R.id.day_cell_1_6),
            intArrayOf(R.id.day_cell_2_0, R.id.day_cell_2_1, R.id.day_cell_2_2, R.id.day_cell_2_3, R.id.day_cell_2_4, R.id.day_cell_2_5, R.id.day_cell_2_6),
            intArrayOf(R.id.day_cell_3_0, R.id.day_cell_3_1, R.id.day_cell_3_2, R.id.day_cell_3_3, R.id.day_cell_3_4, R.id.day_cell_3_5, R.id.day_cell_3_6),
            intArrayOf(R.id.day_cell_4_0, R.id.day_cell_4_1, R.id.day_cell_4_2, R.id.day_cell_4_3, R.id.day_cell_4_4, R.id.day_cell_4_5, R.id.day_cell_4_6),
        )

        private val dayNumberIds = arrayOf(
            intArrayOf(R.id.day_number_0_0, R.id.day_number_0_1, R.id.day_number_0_2, R.id.day_number_0_3, R.id.day_number_0_4, R.id.day_number_0_5, R.id.day_number_0_6),
            intArrayOf(R.id.day_number_1_0, R.id.day_number_1_1, R.id.day_number_1_2, R.id.day_number_1_3, R.id.day_number_1_4, R.id.day_number_1_5, R.id.day_number_1_6),
            intArrayOf(R.id.day_number_2_0, R.id.day_number_2_1, R.id.day_number_2_2, R.id.day_number_2_3, R.id.day_number_2_4, R.id.day_number_2_5, R.id.day_number_2_6),
            intArrayOf(R.id.day_number_3_0, R.id.day_number_3_1, R.id.day_number_3_2, R.id.day_number_3_3, R.id.day_number_3_4, R.id.day_number_3_5, R.id.day_number_3_6),
            intArrayOf(R.id.day_number_4_0, R.id.day_number_4_1, R.id.day_number_4_2, R.id.day_number_4_3, R.id.day_number_4_4, R.id.day_number_4_5, R.id.day_number_4_6),
        )

        private val eventLabelIds = arrayOf(
            arrayOf(
                intArrayOf(R.id.day_event_0_0_0, R.id.day_event_0_0_1, R.id.day_event_0_0_2, R.id.day_event_0_0_3),
                intArrayOf(R.id.day_event_0_1_0, R.id.day_event_0_1_1, R.id.day_event_0_1_2, R.id.day_event_0_1_3),
                intArrayOf(R.id.day_event_0_2_0, R.id.day_event_0_2_1, R.id.day_event_0_2_2, R.id.day_event_0_2_3),
                intArrayOf(R.id.day_event_0_3_0, R.id.day_event_0_3_1, R.id.day_event_0_3_2, R.id.day_event_0_3_3),
                intArrayOf(R.id.day_event_0_4_0, R.id.day_event_0_4_1, R.id.day_event_0_4_2, R.id.day_event_0_4_3),
                intArrayOf(R.id.day_event_0_5_0, R.id.day_event_0_5_1, R.id.day_event_0_5_2, R.id.day_event_0_5_3),
                intArrayOf(R.id.day_event_0_6_0, R.id.day_event_0_6_1, R.id.day_event_0_6_2, R.id.day_event_0_6_3),
            ),
            arrayOf(
                intArrayOf(R.id.day_event_1_0_0, R.id.day_event_1_0_1, R.id.day_event_1_0_2, R.id.day_event_1_0_3),
                intArrayOf(R.id.day_event_1_1_0, R.id.day_event_1_1_1, R.id.day_event_1_1_2, R.id.day_event_1_1_3),
                intArrayOf(R.id.day_event_1_2_0, R.id.day_event_1_2_1, R.id.day_event_1_2_2, R.id.day_event_1_2_3),
                intArrayOf(R.id.day_event_1_3_0, R.id.day_event_1_3_1, R.id.day_event_1_3_2, R.id.day_event_1_3_3),
                intArrayOf(R.id.day_event_1_4_0, R.id.day_event_1_4_1, R.id.day_event_1_4_2, R.id.day_event_1_4_3),
                intArrayOf(R.id.day_event_1_5_0, R.id.day_event_1_5_1, R.id.day_event_1_5_2, R.id.day_event_1_5_3),
                intArrayOf(R.id.day_event_1_6_0, R.id.day_event_1_6_1, R.id.day_event_1_6_2, R.id.day_event_1_6_3),
            ),
            arrayOf(
                intArrayOf(R.id.day_event_2_0_0, R.id.day_event_2_0_1, R.id.day_event_2_0_2, R.id.day_event_2_0_3),
                intArrayOf(R.id.day_event_2_1_0, R.id.day_event_2_1_1, R.id.day_event_2_1_2, R.id.day_event_2_1_3),
                intArrayOf(R.id.day_event_2_2_0, R.id.day_event_2_2_1, R.id.day_event_2_2_2, R.id.day_event_2_2_3),
                intArrayOf(R.id.day_event_2_3_0, R.id.day_event_2_3_1, R.id.day_event_2_3_2, R.id.day_event_2_3_3),
                intArrayOf(R.id.day_event_2_4_0, R.id.day_event_2_4_1, R.id.day_event_2_4_2, R.id.day_event_2_4_3),
                intArrayOf(R.id.day_event_2_5_0, R.id.day_event_2_5_1, R.id.day_event_2_5_2, R.id.day_event_2_5_3),
                intArrayOf(R.id.day_event_2_6_0, R.id.day_event_2_6_1, R.id.day_event_2_6_2, R.id.day_event_2_6_3),
            ),
            arrayOf(
                intArrayOf(R.id.day_event_3_0_0, R.id.day_event_3_0_1, R.id.day_event_3_0_2, R.id.day_event_3_0_3),
                intArrayOf(R.id.day_event_3_1_0, R.id.day_event_3_1_1, R.id.day_event_3_1_2, R.id.day_event_3_1_3),
                intArrayOf(R.id.day_event_3_2_0, R.id.day_event_3_2_1, R.id.day_event_3_2_2, R.id.day_event_3_2_3),
                intArrayOf(R.id.day_event_3_3_0, R.id.day_event_3_3_1, R.id.day_event_3_3_2, R.id.day_event_3_3_3),
                intArrayOf(R.id.day_event_3_4_0, R.id.day_event_3_4_1, R.id.day_event_3_4_2, R.id.day_event_3_4_3),
                intArrayOf(R.id.day_event_3_5_0, R.id.day_event_3_5_1, R.id.day_event_3_5_2, R.id.day_event_3_5_3),
                intArrayOf(R.id.day_event_3_6_0, R.id.day_event_3_6_1, R.id.day_event_3_6_2, R.id.day_event_3_6_3),
            ),
            arrayOf(
                intArrayOf(R.id.day_event_4_0_0, R.id.day_event_4_0_1, R.id.day_event_4_0_2, R.id.day_event_4_0_3),
                intArrayOf(R.id.day_event_4_1_0, R.id.day_event_4_1_1, R.id.day_event_4_1_2, R.id.day_event_4_1_3),
                intArrayOf(R.id.day_event_4_2_0, R.id.day_event_4_2_1, R.id.day_event_4_2_2, R.id.day_event_4_2_3),
                intArrayOf(R.id.day_event_4_3_0, R.id.day_event_4_3_1, R.id.day_event_4_3_2, R.id.day_event_4_3_3),
                intArrayOf(R.id.day_event_4_4_0, R.id.day_event_4_4_1, R.id.day_event_4_4_2, R.id.day_event_4_4_3),
                intArrayOf(R.id.day_event_4_5_0, R.id.day_event_4_5_1, R.id.day_event_4_5_2, R.id.day_event_4_5_3),
                intArrayOf(R.id.day_event_4_6_0, R.id.day_event_4_6_1, R.id.day_event_4_6_2, R.id.day_event_4_6_3),
            ),
        )
    }
}
