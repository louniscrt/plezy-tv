package com.plezy.jellyfin.ui.common

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.util.AttributeSet
import android.view.View
import android.widget.ScrollView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * Grand chiffre détouré façon "Top 10" Netflix (contour gris, remplissage noir).
 */
class OutlinedNumberView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {

    var number: String = "1"
        set(value) {
            field = value
            invalidate()
        }

    private val density = resources.displayMetrics.density

    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.5f * density
        color = 0xFF8C8C8C.toInt()
        typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
        textAlign = Paint.Align.RIGHT
        strokeJoin = Paint.Join.ROUND
    }

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = 0xFF000000.toInt()
        typeface = Typeface.create("sans-serif-black", Typeface.BOLD)
        textAlign = Paint.Align.RIGHT
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val size = height * if (number.length > 1) 0.95f else 1.12f
        strokePaint.textSize = size
        fillPaint.textSize = size
        // Le chiffre déborde légèrement sous l'affiche (comme Netflix)
        val x = width + 14f * density
        val y = height - (fillPaint.descent() * 0.35f)
        canvas.drawText(number, x, y, fillPaint)
        canvas.drawText(number, x, y, strokePaint)
    }
}

/**
 * LayoutManager horizontal qui garde la vignette sélectionnée calée à gauche,
 * exactement comme les rangées de Netflix sur TV.
 */
class StartAlignLayoutManager(context: Context) :
    LinearLayoutManager(context, HORIZONTAL, false) {

    override fun requestChildRectangleOnScreen(
        parent: RecyclerView,
        child: View,
        rect: Rect,
        immediate: Boolean,
        focusedChildVisible: Boolean
    ): Boolean {
        val dx = getDecoratedLeft(child) - paddingLeft
        if (dx == 0) return false
        if (immediate) parent.scrollBy(dx, 0) else parent.smoothScrollBy(dx, 0)
        return true
    }
}

/**
 * ScrollView dont le défilement est entièrement piloté par l'activité
 * (la rangée active est toujours alignée en haut de la zone des rangées).
 */
class RowsScrollView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : ScrollView(context, attrs) {
    override fun computeScrollDeltaToGetChildRectOnScreen(rect: Rect?): Int = 0
}
