import en from './en.json' with { type: 'json' };
import ru from './ru.json' with { type: 'json' };

/**
 * The admin panel's own texts: served by the API to admins only, so the public
 * dictionaries of the web app say nothing about the admin tools.
 */
export const ADMIN_UI_DICTIONARIES: Readonly<Record<string, object>> = {
  en,
  ru,
};
