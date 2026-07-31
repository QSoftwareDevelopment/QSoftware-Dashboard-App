#!/usr/bin/env node
/**
 * Reports what this machine can actually build, before a build fails and the
 * reason has to be reverse-engineered from a native toolchain error.
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const check = (label, fn, hint) => {
  try {
    const value = fn()
    console.log(`  ok    ${label.padEnd(22)} ${value ?? ''}`)
    return true
  } catch {
    console.log(`  MISS  ${label.padEnd(22)} ${hint}`)
    return false
  }
}

const run = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()

console.log('\nQ Software Dashboard App — environment\n')

console.log('Shared')
check('node', () => run('node -v'), 'install Node 20+')
check('capacitor cli', () => run('npx cap --version'), 'npm install')

console.log('\niOS')
const xcode = check(
  'xcode',
  () => run('xcodebuild -version').split('\n')[0],
  'install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app',
)
check('cocoapods', () => run('pod --version'), 'sudo gem install cocoapods  (or: brew install cocoapods)')
check('ios project', () => (existsSync('ios/App/App.xcworkspace') ? 'present' : (() => { throw 0 })()), 'npx cap add ios')

console.log('\nAndroid')
// Capacitor 7 compiles at source level 21. Anything older dies with
// "invalid source release: 21" deep in a Gradle task, which reads like a project
// problem rather than a JDK problem — so the version is checked, not just presence.
check(
  'jdk 21+',
  () => {
    const banner = run('java -version 2>&1').split('\n')[0]
    const major = Number(/"(\d+)/.exec(banner)?.[1])
    if (!Number.isFinite(major) || major < 21) {
      throw new Error(banner)
    }
    return banner
  },
  (() => {
    let found = 'not found'
    try {
      found = run('java -version 2>&1').split('\n')[0]
    } catch {
      /* no java at all */
    }
    return `need JDK 21+, have ${found} — brew install openjdk@21`
  })(),
)
const sdkPaths = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  join(homedir(), 'Library/Android/sdk'),
].filter(Boolean)
check(
  'android sdk',
  () => sdkPaths.find(existsSync) ?? (() => { throw 0 })(),
  'install Android Studio, then Settings > SDK Manager',
)
check('android project', () => (existsSync('android/gradlew') ? 'present' : (() => { throw 0 })()), 'npx cap add android')

console.log('\nAssets')
check('logo source', () => (existsSync('assets/logo.png') ? 'assets/logo.png' : (() => { throw 0 })()), 'add assets/logo.png (1024x1024)')

if (!xcode) {
  console.log('\nNote: iOS requires macOS with full Xcode. Command Line Tools alone cannot build an app.')
}
console.log('')
