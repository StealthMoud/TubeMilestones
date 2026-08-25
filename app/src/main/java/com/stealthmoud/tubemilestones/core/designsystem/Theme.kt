package com.stealthmoud.tubemilestones.core.designsystem

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val DarkColors =
    darkColorScheme(
        primary = Violet,
        onPrimary = Graphite950,
        primaryContainer = Color(0xFF332668),
        onPrimaryContainer = VioletSoft,
        secondary = Mint,
        onSecondary = Graphite950,
        secondaryContainer = Color(0xFF173E38),
        onSecondaryContainer = Color(0xFFB0F2E3),
        tertiary = Amber,
        onTertiary = Graphite950,
        tertiaryContainer = Color(0xFF4C3515),
        onTertiaryContainer = Color(0xFFFFDEAA),
        background = Graphite950,
        onBackground = Graphite100,
        surface = Graphite900,
        onSurface = Graphite100,
        surfaceVariant = Graphite800,
        onSurfaceVariant = Graphite300,
        outline = Color(0xFF817A8C),
        outlineVariant = Graphite700,
        error = ErrorDark
    )

private val LightColors =
    lightColorScheme(
        primary = VioletDeep,
        onPrimary = Color.White,
        primaryContainer = VioletSoft,
        onPrimaryContainer = Color(0xFF251257),
        secondary = MintDeep,
        onSecondary = Color.White,
        secondaryContainer = Color(0xFFC0F4E7),
        onSecondaryContainer = Color(0xFF073C32),
        tertiary = AmberDeep,
        onTertiary = Color.White,
        tertiaryContainer = Color(0xFFFFE1B2),
        onTertiaryContainer = Color(0xFF3E2800),
        background = Paper,
        onBackground = Ink,
        surface = Color.White,
        onSurface = Ink,
        surfaceVariant = Color(0xFFF0ECF4),
        onSurfaceVariant = Color(0xFF5E5866),
        outline = Color(0xFF77717E),
        outlineVariant = Color(0xFFD8D1DD),
        error = ErrorLight
    )

@Composable
fun TubeMilestonesTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    val colorScheme =
        when {
            dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && darkTheme ->
                dynamicDarkColorScheme(LocalContext.current)

            dynamicColor && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
                dynamicLightColorScheme(LocalContext.current)

            darkTheme -> DarkColors

            else -> LightColors
        }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = TubeMilestonesTypography,
        shapes = TubeMilestonesShapes,
        content = content
    )
}
