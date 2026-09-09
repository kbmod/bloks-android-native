package dev.bloks.mobile

import com.facebook.react.ReactActivity
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "BloksMobile"

    override fun createReactActivityDelegate() =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
