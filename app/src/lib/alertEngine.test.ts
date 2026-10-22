import { describe, expect, it } from 'vitest';
import { pushEndpointOk } from './alertEngine';

describe('pushEndpointOk', () => {
  it('accepts the browser push services and app tokens', () => {
    for (const e of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QG9', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-db5p.notify.windows.com/w/?token=1']) {
      expect(pushEndpointOk('web', e)).toBe(true);
    }
    expect(pushEndpointOk('fcm', 'fcm:cXyZ_123-abc:APA91bHq0123456789')).toBe(true);
  });
  it('refuses anything else', () => {
    for (const e of ['https://evil.com/x', 'https://fcm.googleapis.com.evil.com/x', 'http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://10.0.0.5/x', 'not a url']) {
      expect(pushEndpointOk('web', e)).toBe(false);
    }
    expect(pushEndpointOk('fcm', 'fcm:short')).toBe(false);
    expect(pushEndpointOk('fcm', 'fcm:has spaces and stuff that is long')).toBe(false);
  });
});
