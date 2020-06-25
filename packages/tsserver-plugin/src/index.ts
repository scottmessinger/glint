import type ts from 'typescript/lib/tsserverlibrary';
import VirtualModuleManager from './virtual-module-manager';
import { patchLib } from './patch/lib';
import { patchLanguageServiceHost } from './patch/language-service-host';
import { loggerFor, Logger } from './logging';
import GlintLanguageService from './language-service';

const init: ts.server.PluginModuleFactory = ({ typescript: ts }) => {
  const modules = new VirtualModuleManager(ts);

  patchLib(ts, modules);

  return {
    create(info) {
      let logger = loggerFor(info);

      logger.log('\nStarting @glint/tsserver-plugin at', new Date().toString());
      patchLanguageServiceHost(info);

      modules.addProject(info.project);

      let glintService = new GlintLanguageService(ts, modules, info);
      let fullService = makeProxy(info.languageService, glintService);

      if (info.config.logLanguageServiceMethodCalls) {
        installMethodLogging(logger, fullService);
      }

      return fullService;
    },
  };
};

export = init;

function makeProxy(base: ts.LanguageService, glint: GlintLanguageService): ts.LanguageService {
  return new Proxy(base, {
    get(_, key: keyof GlintLanguageService) {
      if (key in glint) {
        return glint[key];
      }

      return base[key];
    },

    set(_, key: keyof GlintLanguageService, value) {
      glint[key] = value;
      return true;
    },
  });
}

function installMethodLogging(logger: Logger, service: ts.LanguageService): void {
  for (let _key in service) {
    let key = _key as keyof ts.LanguageService;
    let f: any = service[key];
    if (typeof f === 'function') {
      service[key] = ((...params: any) => {
        logger.log(key, params[0]);
        return f.apply(service, params);
      }) as any;
    }
  }
}