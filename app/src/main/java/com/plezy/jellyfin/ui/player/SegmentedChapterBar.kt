package com.plezy.jellyfin.ui.player

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/**
 * Barre de progression continue avec curseur rond blanc identique au lecteur Infuse 8 (image 2 "Big Buck Bunny") :
 * - Piste horizontale fine et continue (`4dp` de hauteur)
 * - Partie lue en blanc lumineux (`#F2FFFFFF`), partie restante en gris translucide (`#48FFFFFF`)
 * - Curseur circulaire blanc (`12dp` de diamètre) à la position courante
 */
class SegmentedChapterBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val playedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xF2FFFFFF.toInt()
        style = Paint.Style.FILL
    }

    private val unplayedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x48FFFFFF
        style = Paint.Style.FILL
    }

    private val knobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xFFFFFFFF.toInt()
        style = Paint.Style.FILL
    }

    private val trackRect = RectF()
    private val playedRect = RectF()

    private var chapterFractions: List<Float> = emptyList()
    private val markerPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x990C1320.toInt() }
    var progressFraction: Float = 0f
        set(value) {
            field = value.coerceIn(0f, 1f)
            invalidate()
        }

    fun setChapterFractions(fractions: List<Float>) {
        chapterFractions = fractions.filter { it > 0f && it < 1f }.distinct().sorted()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return

        val density = resources.displayMetrics.density
        val barHeight = (if (hasFocus()) 7f else 4f) * density
        val knobRadius = (if (hasFocus()) 8f else 5f) * density
        val cy = h / 2f
        val top = cy - barHeight / 2f
        val bottom = cy + barHeight / 2f
        val cornerRadius = barHeight / 2f

        val pad = knobRadius
        val trackWidth = (w - pad * 2f).coerceAtLeast(1f)
        val knobX = pad + progressFraction * trackWidth

        // Piste complète non lue
        trackRect.set(pad, top, w - pad, bottom)
        canvas.drawRoundRect(trackRect, cornerRadius, cornerRadius, unplayedPaint)

        // Partie lue jusqu'au bouton rond
        playedRect.set(pad, top, knobX, bottom)
        canvas.drawRoundRect(playedRect, cornerRadius, cornerRadius, playedPaint)

        chapterFractions.forEach { fraction ->
            val x = pad + fraction * trackWidth
            canvas.drawRect(x - density, top, x + density, bottom, markerPaint)
        }
        // Bouton circulaire blanc Infuse (Scrubber Knob)
        canvas.drawCircle(knobX, cy, knobRadius, knobPaint)
    }
}
