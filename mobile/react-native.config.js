/**
 * Keep the Android application id available to React Native CLI autolinking.
 * The Android manifest intentionally omits the deprecated `package` attribute;
 * the namespace/applicationId live in app/build.gradle instead.
 */
module.exports = {
  project: {
    android: {
      packageName: 'dev.bloks.mobile',
    },
  },
};
