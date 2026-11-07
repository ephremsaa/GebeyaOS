import { commonEn } from './en/common';
import { authEn } from './en/auth';
import { checkoutEn } from './en/checkout';
import { shiftEn } from './en/shift';
import { catalogEn } from './en/catalog';
import { inventoryEn } from './en/inventory';
import { stocktakeEn } from './en/stocktake';
import { purchasingEn } from './en/purchasing';
import { reportsEn } from './en/reports';
import { syncEn } from './en/sync';
import { staffEn } from './en/staff';
import { settingsEn } from './en/settings';
import { errorsEn } from './en/errors';

import { commonAm } from './am/common';
import { authAm } from './am/auth';
import { checkoutAm } from './am/checkout';
import { shiftAm } from './am/shift';
import { catalogAm } from './am/catalog';
import { inventoryAm } from './am/inventory';
import { stocktakeAm } from './am/stocktake';
import { purchasingAm } from './am/purchasing';
import { reportsAm } from './am/reports';
import { syncAm } from './am/sync';
import { staffAm } from './am/staff';
import { settingsAm } from './am/settings';
import { errorsAm } from './am/errors';

export type SupportedLanguage = 'en' | 'am';

export const NAMESPACED_TRANSLATIONS = {
  en: {
    common: commonEn,
    auth: authEn,
    checkout: checkoutEn,
    shift: shiftEn,
    catalog: catalogEn,
    inventory: inventoryEn,
    stocktake: stocktakeEn,
    purchasing: purchasingEn,
    reports: reportsEn,
    sync: syncEn,
    staff: staffEn,
    settings: settingsEn,
    errors: errorsEn,
  },
  am: {
    common: commonAm,
    auth: authAm,
    checkout: checkoutAm,
    shift: shiftAm,
    catalog: catalogAm,
    inventory: inventoryAm,
    stocktake: stocktakeAm,
    purchasing: purchasingAm,
    reports: reportsAm,
    sync: syncAm,
    staff: staffAm,
    settings: settingsAm,
    errors: errorsAm,
  },
} as const;

export type TranslationNamespace = keyof typeof NAMESPACED_TRANSLATIONS.en;
