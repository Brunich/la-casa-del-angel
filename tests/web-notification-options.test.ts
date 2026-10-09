import test from 'node:test';
import assert from 'node:assert/strict';
import {webNotificationOptions} from '../src/lib/web-notification-options.ts';
test('web notices contain only generic copy and the public app icon',()=>{
 const options=webNotificationOptions('care-12345');
 assert.equal(options.tag,'care-12345');assert.equal(options.icon,'/icons/icon-192.png');
 assert.equal(options.data,undefined);assert.equal(options.image,undefined);
 assert.doesNotMatch(JSON.stringify(options),/resident_id|medication_name|photo_path|token|email/);
});
test('notification tags cannot contain clinical identifiers or arbitrary user input',()=>{
 for(const value of ['resident:00000000-0000-4000-8000-000000000001','care-person@example.com','care-12345\nname','care-','http://other.example'])assert.throws(()=>webNotificationOptions(value));
});
