import test from 'node:test';
import assert from 'node:assert/strict';
import {authErrorMessage} from '../src/lib/auth-errors.ts';

test('registration disabled is configuration, not a bad password or outage',()=>{
 const message=authErrorMessage({code:'signup_disabled',status:422},'signup');
 assert.match(message,/registro.*desactivado/i);assert.match(message,/residencia/i);assert.doesNotMatch(message,/contraseña incorrecta/i);
});
test('server and network failures have distinct actionable explanations',()=>{
 assert.match(authErrorMessage({status:503},'signup'),/servicio.*no está disponible/i);
 assert.match(authErrorMessage({name:'AuthRetryableFetchError',status:0},'signup'),/conectar/i);
 assert.match(authErrorMessage(new TypeError('Failed to fetch private payload'),'signup'),/conectar/i);
});
test('rate limit and email delivery errors are not guessed from raw server messages',()=>{
 assert.match(authErrorMessage({code:'over_email_send_rate_limit',status:429},'signup'),/límite.*correos/i);
 assert.match(authErrorMessage({code:'email_address_not_authorized',status:400},'signup'),/envío de correo/i);
 assert.doesNotMatch(authErrorMessage({status:500,message:'private database host and email'},'signup'),/private database host/);
});
test('login errors do not disclose whether an email has an account',()=>{
 assert.match(authErrorMessage({code:'invalid_credentials',status:400},'login'),/correo.*contraseña/i);
 assert.match(authErrorMessage({code:'email_not_confirmed'},'login'),/confirma.*correo/i);
 assert.doesNotMatch(authErrorMessage({code:'user_already_exists',message:'person@private.test'},'signup'),/person@private/);
});
