// src/core/plugin-manager.ts

import { IPlugin } from './plugin';
import { Application } from './application';

export class PluginManager {
  private readonly plugins: IPlugin[] = [];

  constructor(private readonly app: Application) {}

  async register(plugin: IPlugin): Promise<void> {
    this.plugins.push(plugin);
    if (typeof plugin.install === 'function') {
        await plugin.install(this.app);
    }
  }

  async runHook(hookName: 'onInit' | 'onReady' | 'onShutdown'): Promise<void> {
    for (const plugin of this.plugins) {
      if (typeof plugin[hookName] === 'function') {
        await plugin[hookName]!(this.app);
      }
    }
  }
}