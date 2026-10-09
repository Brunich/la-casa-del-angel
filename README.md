# La Casa del Ángel

Proyecto de Bruno Salas: sitio para una residencia de adultos mayores y portal privado de cuidados, con interfaz compartida web, Android e iOS.

React, TypeScript, Vite, Capacitor y Supabase. Enfermería registra alimentación, baño, actividad, medicamentos e incidentes. Familia consulta expedientes autorizados; Managers administran su sede y Dirección general supervisa la organización. Fotografías privadas, compresión con vista previa, auditoría y control de acceso en servidor.

## Ejecutar

Node.js 24: npm ci, copiar .env.example a .env.local y configurar un proyecto Supabase propio de evaluación; npm run dev. npm test verifica lógica; npm run build compila. npm run mobile:sync prepara los proyectos móviles. SQL inicial para una base vacía en supabase/migrations; revisar historial y migraciones antes de aplicarlas.

## Estado y límites

Versión de evaluación. Android compilado con firma de depuración; iOS aún requiere compilación y firma Apple. No usar con expedientes reales hasta completar pruebas de permisos entre cuentas, Storage, dispositivos, respaldo, capacidad y revisión legal. Las notificaciones locales requieren permiso y sincronización; no hay push remoto centralizado implementado. La cuenta registrada requiere confirmar correo y asignación administrativa; registrarse no concede acceso clínico.

Esta copia pública omite configuración operativa privada, cuentas de proveedores, credenciales, capturas del portal e historial privado. Configura tus propios servicios. No incluye ni permite consultar datos de residentes.
