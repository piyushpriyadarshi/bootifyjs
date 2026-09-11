import * as os from 'os'
import { VERSION } from '../../version'

export interface SystemInfo {
  hostname: string
  username: string
  platform: string
  arch: string
  cpuCount: number
  totalMemoryBytes: number
  appVersion: string
  cwd: string
}

/** Source of system/environment facts for startup banners. Injectable for tests. */
export interface SystemInfoProvider {
  get(): SystemInfo
}

export class DefaultSystemInfoProvider implements SystemInfoProvider {
  get(): SystemInfo {
    let username = 'unknown'
    try {
      username = os.userInfo().username
    } catch {
      // userInfo can fail in restricted environments
    }

    return {
      hostname: os.hostname(),
      username,
      platform: os.platform(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      appVersion: VERSION,
      cwd: process.cwd(),
    }
  }
}
