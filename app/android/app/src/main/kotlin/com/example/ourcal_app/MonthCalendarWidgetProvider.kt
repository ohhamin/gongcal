package com.example.ourcal_app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.RelativeSizeSpan
import android.text.style.StyleSpan
import android.graphics.Typeface
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

        if (intent.action in dateRefreshActions) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, MonthCalendarWidgetProvider::class.java)
            updateWidgets(context, manager, manager.getAppWidgetIds(component))
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
        val displayCalendar = snapshot?.monthCalendar ?: now
        val year = displayCalendar.get(Calendar.YEAR)
        val month = displayCalendar.get(Calendar.MONTH)
        val todayKey = dateKey(now)
        val holidayByDate = loadFallbackHolidays(context)
        val snapshotEventsByDate = snapshot?.eventsByDate.orEmpty()

        views.setTextViewText(R.id.widget_title, SimpleDateFormat("yyyy년 M월", Locale.KOREA).format(displayCalendar.time))
        views.setTextViewText(R.id.widget_subtitle, if (snapshot == null) "앱을 열면 일정이 동기화돼요" else "앱 월간 캘린더 동기화")
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
                val dateKey = "%04d-%02d-%02d".format(Locale.US, year, month + 1, day)
                val holiday = snapshotEventsByDate[dateKey]?.firstOrNull { it.isHoliday }?.title
                    ?: holidayByDate[dateKey]
                val dayEvents = snapshotEventsByDate[dateKey].orEmpty().filterNot { it.isHoliday }
                val isToday = dateKey == todayKey
                val isRedDay = holiday != null || column == 0 || column == 6

                views.setTextViewText(viewId, buildDayCellText(day, holiday, dayEvents, isToday, isRedDay))
                views.setTextColor(viewId, Color.parseColor(if (isToday) "#FFFFFF" else "#111122"))
                views.setInt(viewId, "setBackgroundResource", if (isToday) R.drawable.widget_today_bg else R.drawable.widget_day_cell_bg)
            } else {
                views.setTextViewText(viewId, "")
                views.setTextColor(viewId, Color.TRANSPARENT)
                views.setInt(viewId, "setBackgroundResource", R.drawable.widget_day_cell_bg)
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    private fun buildDayCellText(
        day: Int,
        holiday: String?,
        events: List<WidgetEvent>,
        isToday: Boolean,
        isRedDay: Boolean,
    ): SpannableStringBuilder {
        val builder = SpannableStringBuilder()
        appendStyled(
            builder,
            day.toString(),
            color = when {
                isToday -> Color.WHITE
                isRedDay -> RED_DAY_COLOR
                else -> TEXT_COLOR
            },
            size = 1.0f,
            bold = true,
        )

        if (!holiday.isNullOrBlank()) {
            builder.append('\n')
            appendStyled(builder, holiday.take(5), color = if (isToday) Color.WHITE else RED_DAY_COLOR, size = 0.78f, bold = true)
        }

        events.take(MAX_VISIBLE_EVENTS).forEach { event ->
            builder.append('\n')
            val prefix = if (event.isPendingInvite) "◌ " else "● "
            appendStyled(
                builder,
                (prefix + event.title).take(8),
                color = if (isToday) Color.WHITE else event.color,
                size = 0.76f,
                bold = true,
            )
        }

        if (events.size > MAX_VISIBLE_EVENTS) {
            builder.append('\n')
            appendStyled(builder, "+${events.size - MAX_VISIBLE_EVENTS}", color = if (isToday) Color.WHITE else PRIMARY_COLOR, size = 0.76f, bold = true)
        }

        return builder
    }

    private fun appendStyled(
        builder: SpannableStringBuilder,
        text: String,
        color: Int,
        size: Float,
        bold: Boolean,
    ) {
        val start = builder.length
        builder.append(text)
        builder.setSpan(ForegroundColorSpan(color), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        builder.setSpan(RelativeSizeSpan(size), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        if (bold) builder.setSpan(StyleSpan(Typeface.BOLD), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
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
                    val dateKey = currentLocdate?.takeIf { it.length == 8 }?.let {
                        "${it.substring(0, 4)}-${it.substring(4, 6)}-${it.substring(6, 8)}"
                    }
                    if (!dateKey.isNullOrBlank() && !currentName.isNullOrBlank()) holidays[dateKey] = currentName!!
                    currentName = null
                    currentLocdate = null
                }
                eventType = parser.next()
            }
        }
        return holidays
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

    private fun dateKey(calendar: Calendar): String = "%04d-%02d-%02d".format(
        Locale.US,
        calendar.get(Calendar.YEAR),
        calendar.get(Calendar.MONTH) + 1,
        calendar.get(Calendar.DAY_OF_MONTH),
    )

    private fun parseColor(rawColor: String, fallback: Int): Int {
        return runCatching {
            when {
                rawColor.startsWith("#") -> Color.parseColor(rawColor)
                rawColor.startsWith("rgba") -> {
                    val values = rawColor.substringAfter('(').substringBefore(')').split(',').map { it.trim() }
                    Color.rgb(values[0].toInt(), values[1].toInt(), values[2].toInt())
                }
                else -> fallback
            }
        }.getOrDefault(fallback)
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
    )

    companion object {
        private const val MAX_VISIBLE_EVENTS = 3
        private val TEXT_COLOR = Color.parseColor("#111122")
        private val RED_DAY_COLOR = Color.parseColor("#DC2626")
        private val PRIMARY_COLOR = Color.parseColor("#111122")
        private val GROUP_EVENT_COLOR = Color.parseColor("#10B981")

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
            intArrayOf(R.id.day_0_0, R.id.day_0_1, R.id.day_0_2, R.id.day_0_3, R.id.day_0_4, R.id.day_0_5, R.id.day_0_6),
            intArrayOf(R.id.day_1_0, R.id.day_1_1, R.id.day_1_2, R.id.day_1_3, R.id.day_1_4, R.id.day_1_5, R.id.day_1_6),
            intArrayOf(R.id.day_2_0, R.id.day_2_1, R.id.day_2_2, R.id.day_2_3, R.id.day_2_4, R.id.day_2_5, R.id.day_2_6),
            intArrayOf(R.id.day_3_0, R.id.day_3_1, R.id.day_3_2, R.id.day_3_3, R.id.day_3_4, R.id.day_3_5, R.id.day_3_6),
            intArrayOf(R.id.day_4_0, R.id.day_4_1, R.id.day_4_2, R.id.day_4_3, R.id.day_4_4, R.id.day_4_5, R.id.day_4_6),
            intArrayOf(R.id.day_5_0, R.id.day_5_1, R.id.day_5_2, R.id.day_5_3, R.id.day_5_4, R.id.day_5_5, R.id.day_5_6),
        )
    }
}
