// src/core/plugin.ts

import { Application } from './application';

export interface IPlugin {
  /**
   * A unique name for the plugin.
   */
  name: string;

  /**
   * The version of the plugin.
   */
  version: string;

  /**
   * The core method called by the framework to install the plugin.
   * @param app The application instance, providing access to core functionalities.
   */
  install(app: Application): Promise<void> | void;

  /**
   * Optional lifecycle hook called after the application is initialized.
   */
  onInit?(app: Application): Promise<void> | void;

  /**
   * Optional lifecycle hook called after the server is ready.
   */
  onReady?(app: Application): Promise<void> | void;

  /**
   * Optional lifecycle hook called when the application is shutting down.
   */
  onShutdown?(app: Application): Promise<void> | void;
}