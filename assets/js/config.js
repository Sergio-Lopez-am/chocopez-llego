/* ============================================================
   LLEGO · Chocopez — Configuración de la plataforma
   Edita este archivo para ajustar los datos del negocio.
   ============================================================ */
window.LLEGO_CONFIG = {
  // URL de la aplicación web de Google Apps Script (termina en /exec).
  // Mientras esté vacía, la plataforma funciona en MODO DEMOSTRACIÓN:
  // los pedidos quedan guardados solo en el navegador donde se hacen.
  API_URL: '',

  NEGOCIO: {
    marca: 'LLEGO',
    empresa: 'Chocopez',
    razonSocial: 'Chocopez',      // Nombre o razón social del responsable de los datos
    nit: '',                      // NIT o cédula del responsable
    ciudad: '',                   // Ciudad de operación (se precarga en el formulario de domicilio)
    direccionRecogida: '',        // Dirección del punto donde el cliente recoge su pedido
    horarioRecogida: '',          // Ej.: Lunes a sábado, 8:00 a. m. – 5:00 p. m.
    coberturaDomicilio: '',       // Ej.: Barrios del norte y centro de la ciudad
    telefono: '',                 // Teléfono de contacto, ej.: 300 123 4567
    whatsapp: '',                 // Solo números con indicativo, ej.: 573001234567
    correo: ''                    // Correo para PQR y protección de datos personales
  },

  // Medios de pago que el cliente puede elegir (la plataforma no procesa pagos en línea).
  PAGOS: ['Efectivo', 'Transferencia (Nequi, Daviplata o Bancolombia)'],

  // Franjas horarias disponibles.
  FRANJAS_DOMICILIO: ['Lo antes posible', 'Hoy en la mañana (8:00 a. m. – 12:00 m.)', 'Hoy en la tarde (12:00 m. – 5:00 p. m.)', 'Mañana en la mañana (8:00 a. m. – 12:00 m.)', 'Mañana en la tarde (12:00 m. – 5:00 p. m.)'],
  FRANJAS_RECOGIDA: ['8:00 a. m. – 12:00 m.', '12:00 m. – 5:00 p. m.'],

  // Versión vigente de la Política de Tratamiento de Datos (queda registrada en cada pedido).
  VERSION_POLITICA: '1.0',
  FECHA_POLITICA: '11 de octubre de 2026'
};
