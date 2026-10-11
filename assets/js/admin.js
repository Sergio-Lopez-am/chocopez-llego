/* LLEGO · Chocopez — panel de alistamiento, despacho y entregas */
(function () {
  'use strict';
  var L = window.LLEGO, API = window.LLEGO_API;
  var N = (window.LLEGO_CONFIG || {}).NEGOCIO || {};
  var $ = L.$, esc = L.esc;
  var KEY_SES = 'llego_staff_clave', KEY_DOMI = 'llego_domi_nombre', KEY_DOMIS = 'llego_domis_usados';
  var REFRESCO_MS = 20000;

  var TABS = {
    admin: [
      { id: 'alistamiento', label: 'Alistamiento', estados: ['RECIBIDO', 'ALISTAMIENTO'], orden: 'asc', vacio: 'No hay pedidos por alistar.' },
      { id: 'despacho', label: 'Despacho', estados: ['LISTO', 'EN_CAMINO'], orden: 'asc', vacio: 'No hay pedidos en despacho.' },
      { id: 'finalizados', label: 'Finalizados', estados: ['ENTREGADO', 'CANCELADO'], orden: 'desc', vacio: 'Aún no hay pedidos finalizados.' }
    ],
    domiciliario: [
      { id: 'recoger', label: 'Por recoger', estados: ['LISTO'], orden: 'asc', vacio: 'No hay pedidos listos para salir.' },
      { id: 'camino', label: 'En camino', estados: ['EN_CAMINO'], orden: 'asc', vacio: 'No tienes pedidos en camino.' }
    ]
  };

  var S = {
    clave: '', rol: '', pedidos: [], tab: '', q: '', abiertos: true,
    vistos: null, resaltar: {}, check: {}, domiInput: {}, ocupado: {},
    timer: null, cargando: null, pendiente: false
  };

  /* ---------- Sonido de aviso para pedidos nuevos ---------- */
  var audio = null;
  function activarAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function beep() {
    if (!audio) return;
    try {
      [0, 0.22].forEach(function (t) {
        var o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + t;
        o.type = 'sine';
        o.frequency.value = t ? 1175 : 880;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g); g.connect(audio.destination);
        o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) { /* sin audio */ }
  }

  /* ---------- Sesión ---------- */
  function mostrarLogin(msg) {
    clearInterval(S.timer);
    $('#vistaPanel').hidden = true;
    $('#vistaLogin').hidden = false;
    $('#demoKeys').hidden = !API.demo;
    var box = $('#loginError');
    box.hidden = !msg;
    if (msg) box.textContent = msg;
    setTimeout(function () { $('#clave').focus(); }, 50);
  }

  function login(clave, recordar, silencioso) {
    var btn = $('#loginBtn');
    btn.disabled = true;
    btn.textContent = 'Verificando…';
    return API.call('login', { clave: clave }).then(function (r) {
      S.clave = clave;
      S.rol = r.rol;
      if (recordar) L.store.set(KEY_SES, clave);
      L.session.set(KEY_SES, clave);
      iniciarPanel();
    }).catch(function (e) {
      L.store.del(KEY_SES);
      L.session.del(KEY_SES);
      mostrarLogin(silencioso ? '' : e.message);
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    });
  }

  function salir() {
    L.store.del(KEY_SES);
    L.session.del(KEY_SES);
    S.clave = ''; S.rol = ''; S.pedidos = []; S.vistos = null;
    $('#clave').value = '';
    mostrarLogin();
  }

  function iniciarPanel() {
    var admin = S.rol === 'admin';
    $('#vistaLogin').hidden = true;
    $('#vistaPanel').hidden = false;
    $('#demoBanner').hidden = !API.demo;
    $('#rolLabel').textContent = admin ? 'Administrador' : 'Domiciliario';
    $('#panelTitulo').textContent = admin ? 'Alistamiento y despacho' : 'Mis entregas';
    $('#btnXML').hidden = !admin;
    $('#tiendaSwitch').hidden = !admin;
    $('#kpis').hidden = !admin;
    $('#domiBar').hidden = admin;
    if (!admin) $('#domiNombre').value = L.store.get(KEY_DOMI, '') || '';
    pintarDomis();
    S.tab = TABS[S.rol][0].id;
    S.vistos = null;
    render();
    cargar(false);
    clearInterval(S.timer);
    S.timer = setInterval(function () {
      if (document.visibilityState === 'visible') cargar(true);
    }, REFRESCO_MS);
  }

  /* ---------- Datos ---------- */
  function cargar(auto) {
    if (S.cargando) return S.cargando;
    var btn = $('#btnRefrescar');
    btn.disabled = true;
    if (!auto) btn.textContent = 'Actualizando…';
    S.cargando = API.call('listar', { clave: S.clave }).then(function (r) {
      var nuevos = [];
      if (S.vistos) r.pedidos.forEach(function (p) { if (!S.vistos[p.codigo]) nuevos.push(p); });
      S.vistos = S.vistos || {};
      r.pedidos.forEach(function (p) { S.vistos[p.codigo] = true; });
      S.pedidos = r.pedidos;
      S.abiertos = r.abiertos !== false;
      $('#syncInfo').textContent = 'Actualizado a las ' + L.hora(L.ahoraISO()) + ' · se actualiza solo cada ' + (REFRESCO_MS / 1000) + ' segundos.';
      if (nuevos.length) avisarNuevos(nuevos);
      if (puedeRenderizar()) render(); else S.pendiente = true;
    }).catch(function (e) {
      if (e.message === 'Clave incorrecta.') { salir(); mostrarLogin('La clave cambió o ya no es válida. Ingresa de nuevo.'); return; }
      $('#syncInfo').textContent = 'Sin conexión con el servidor. Reintentando…';
      if (!auto) L.toast(e.message, 'error');
    }).then(function () {
      S.cargando = null;
      btn.disabled = false;
      btn.textContent = 'Actualizar';
    });
    return S.cargando;
  }

  function avisarNuevos(lista) {
    lista.forEach(function (p) { S.resaltar[p.codigo] = true; });
    var txt = S.rol === 'admin'
      ? (lista.length === 1 ? 'Nuevo pedido ' + lista[0].codigo : lista.length + ' pedidos nuevos')
      : (lista.length === 1 ? 'Pedido ' + lista[0].codigo + ' listo para salir' : lista.length + ' pedidos listos para salir');
    L.toast(txt, 'ok');
    beep();
  }

  function puedeRenderizar() {
    var a = document.activeElement;
    return !(a && $('#orders').contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }

  function buscarPedido(codigo) {
    return S.pedidos.filter(function (p) { return p.codigo === codigo; })[0];
  }
  function reemplazar(p) {
    var i = S.pedidos.map(function (x) { return x.codigo; }).indexOf(p.codigo);
    if (i >= 0) S.pedidos[i] = p; else S.pedidos.unshift(p);
  }
  function normal(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function coincide(p) {
    if (!S.q) return true;
    var q = normal(S.q);
    return [p.codigo, p.cliente.nombre, p.cliente.telefono, p.entrega.barrio, p.entrega.direccion, p.domiciliario]
      .some(function (v) { return normal(v).indexOf(q) >= 0; });
  }
  function hoyEntregados() {
    var hoy = L.hoyISO();
    return S.pedidos.filter(function (p) { return p.estado === 'ENTREGADO' && String(p.actualizado).slice(0, 10) === hoy; });
  }

  /* ---------- Render ---------- */
  function render() {
    S.pendiente = false;
    var tabs = TABS[S.rol];
    if (!tabs) return;
    var cuenta = {};
    tabs.forEach(function (t) {
      cuenta[t.id] = S.pedidos.filter(function (p) { return t.estados.indexOf(p.estado) >= 0; }).length;
    });
    $('#tabs').innerHTML = tabs.map(function (t) {
      return '<button type="button" class="tab" role="tab" data-tab="' + t.id + '" aria-selected="' + (t.id === S.tab) + '">' +
        esc(t.label) + ' <span class="n">' + cuenta[t.id] + '</span></button>';
    }).join('');

    if (S.rol === 'admin') {
      $('#tiendaAbierta').checked = S.abiertos;
      $('#tiendaTxt').textContent = S.abiertos ? 'Tienda abierta' : 'Tienda pausada';
      var ent = hoyEntregados();
      var k = [
        ['Por alistar', S.pedidos.filter(function (p) { return p.estado === 'RECIBIDO' || p.estado === 'ALISTAMIENTO'; }).length],
        ['Por despachar', S.pedidos.filter(function (p) { return p.estado === 'LISTO'; }).length],
        ['En camino', S.pedidos.filter(function (p) { return p.estado === 'EN_CAMINO'; }).length],
        ['Entregados hoy', ent.length],
        ['Ventas entregadas hoy', L.dinero(ent.reduce(function (s, p) { return s + Number(p.total || 0); }, 0))]
      ];
      $('#kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong></div>'; }).join('');
    }

    var tab = tabs.filter(function (t) { return t.id === S.tab; })[0] || tabs[0];
    var lista = S.pedidos.filter(function (p) { return tab.estados.indexOf(p.estado) >= 0 && coincide(p); });
    lista.sort(function (a, b) {
      return tab.orden === 'asc' ? (a.fecha < b.fecha ? -1 : 1) : (a.actualizado > b.actualizado ? -1 : 1);
    });
    var extra = '';
    if (tab.orden === 'desc' && lista.length > 60) {
      extra = '<div class="empty-panel"><strong>Mostrando los 60 más recientes</strong>Descarga el XML para ver el historial completo.</div>';
      lista = lista.slice(0, 60);
    }
    $('#orders').innerHTML = lista.length
      ? lista.map(tarjeta).join('') + extra
      : '<div class="empty-panel"><strong>' + esc(S.q ? 'Sin resultados' : 'Todo al día') + '</strong>' + esc(S.q ? 'Ningún pedido coincide con la búsqueda.' : tab.vacio) + '</div>';

    var porAtender = S.pedidos.filter(function (p) { return S.rol === 'admin' ? p.estado === 'RECIBIDO' : p.estado === 'LISTO'; }).length;
    document.title = (porAtender ? '(' + porAtender + ') ' : '') + 'Panel de pedidos · LLEGO';
  }

  function tarjeta(p) {
    var admin = S.rol === 'admin', dom = p.tipoEntrega === 'DOMICILIO';
    var tel = p.cliente.telefono || '';
    var h = [];
    h.push('<article class="order' + (S.resaltar[p.codigo] ? ' nuevo' : '') + '" data-codigo="' + esc(p.codigo) + '">');
    h.push('<div class="order-head"><div><div class="order-code">' + esc(p.codigo) + '</div>' +
      '<div class="order-time">' + esc(L.fechaHora(p.fecha)) + ' · ' + esc(L.hace(p.fecha)) + '</div></div>' +
      L.badge(p.estado, p.tipoEntrega) + '</div>');
    h.push('<div class="tags"><span class="tag">' + (dom ? 'Domicilio' : 'Recoge en sitio') + '</span>' +
      '<span class="tag light">Pago: ' + esc(p.pago) + '</span></div>');

    h.push('<div class="block"><h4>Cliente</h4><div class="client">' + esc(p.cliente.nombre) + '</div>' +
      '<div class="contact-row">' +
        '<a class="chip-link" href="tel:' + esc(tel) + '">Llamar ' + esc(L.telefonoFmt(tel)) + '</a>' +
        (/^3/.test(tel) ? '<a class="chip-link" target="_blank" rel="noopener" href="https://wa.me/57' + esc(tel) + '">WhatsApp</a>' : '') +
        (admin && p.cliente.correo ? '<a class="chip-link" href="mailto:' + esc(p.cliente.correo) + '">Correo</a>' : '') +
      '</div></div>');

    if (dom) {
      var dir = [p.entrega.direccion, p.entrega.barrio, p.entrega.ciudad].filter(Boolean).join(', ');
      h.push('<div class="block"><h4>Entregar en</h4>' +
        '<div class="addr">' + esc(p.entrega.direccion) + '</div>' +
        '<div>' + esc([p.entrega.barrio, p.entrega.ciudad].filter(Boolean).join(' · ')) + '</div>' +
        (p.entrega.indicaciones ? '<div class="small muted">' + esc(p.entrega.indicaciones) + '</div>' : '') +
        '<div class="small" style="margin-top:6px"><strong>Cuándo:</strong> ' + esc(p.entrega.franja) + '</div>' +
        (p.domiciliario ? '<div class="small"><strong>Domiciliario:</strong> ' + esc(p.domiciliario) + '</div>' : '') +
        '<div class="contact-row"><a class="chip-link" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(dir) + '">Abrir en el mapa</a></div>' +
        '</div>');
    } else {
      h.push('<div class="block"><h4>Recoge en sitio</h4>' +
        '<div class="addr">' + esc(L.fechaLarga(p.entrega.fechaRecogida)) + '</div>' +
        '<div>' + esc(p.entrega.franja) + '</div></div>');
    }

    var alistando = admin && p.estado === 'ALISTAMIENTO';
    h.push('<div class="block"><h4>' + (alistando ? 'Alistar productos' : 'Productos') + '</h4><ul class="picklist">' +
      p.items.map(function (it, i) {
        var k = p.codigo + '|' + i, ok = !!S.check[k];
        var cuerpo = '<span class="q">' + esc(L.cantidadTxt(it.cantidad, it.unidad)) + '</span><span class="nm">' + esc(it.nombre) + '</span>';
        return '<li class="' + (alistando && ok ? 'done' : '') + '">' +
          (alistando
            ? '<label class="it"><input type="checkbox" data-check="' + esc(k) + '"' + (ok ? ' checked' : '') + '>' + cuerpo + '</label>'
            : '<span class="it">' + cuerpo + '</span>') +
          '<span class="sub">' + L.dinero(it.subtotal) + '</span></li>';
      }).join('') + '</ul></div>');

    h.push('<div class="order-totals">' +
      (dom ? '<div><span>Productos</span><span>' + L.dinero(p.subtotal) + '</span></div>' +
             '<div><span>Domicilio</span><span>' + esc(L.costoDomTxt(p.costoDomicilio)) + '</span></div>' : '') +
      '<div class="grand"><span>Total</span><span>' + L.dinero(p.total) + '</span></div></div>');

    if (p.observaciones) h.push('<div class="note">Nota del cliente: ' + esc(p.observaciones) + '</div>');
    var acc = acciones(p);
    if (acc) h.push('<div class="actions">' + acc + '</div>');
    if (admin) {
      h.push('<details class="hist"><summary>Historial del pedido</summary><ol>' +
        (p.historial || []).map(function (ev) {
          return '<li><strong>' + esc(L.etiquetaEstado(ev.estado, p.tipoEntrega)) + '</strong> · ' + esc(L.fechaHora(ev.fecha)) +
            ' · ' + esc(ev.por) + (ev.nota ? ' · ' + esc(ev.nota) : '') + '</li>';
        }).join('') + '</ol></details>');
    }
    h.push('</article>');
    return h.join('');
  }

  function acciones(p) {
    var admin = S.rol === 'admin';
    var dis = S.ocupado[p.codigo] ? ' disabled' : '';
    function boton(estado, txt, cls) {
      return '<button type="button" class="btn ' + (cls || 'btn-primary') + ' btn-block btn-lg" data-act="estado" data-estado="' + estado + '"' + dis + '>' + txt + '</button>';
    }
    var b = [];
    switch (p.estado) {
      case 'RECIBIDO':
        if (admin) b.push(boton('ALISTAMIENTO', 'Iniciar alistamiento'));
        break;
      case 'ALISTAMIENTO':
        if (admin) b.push(boton('LISTO', p.tipoEntrega === 'DOMICILIO' ? 'Pedido listo · Pasar a despacho' : 'Pedido listo para recoger'));
        break;
      case 'LISTO':
        if (p.tipoEntrega === 'DOMICILIO') {
          if (admin) {
            b.push('<div class="field"><label for="dom-' + esc(p.codigo) + '">Domiciliario que recibe el pedido</label>' +
              '<input id="dom-' + esc(p.codigo) + '" class="input" list="domisList" data-domi="' + esc(p.codigo) + '" value="' + esc(S.domiInput[p.codigo] || '') + '" placeholder="Nombre del domiciliario" maxlength="60" autocomplete="off"></div>');
            b.push(boton('EN_CAMINO', 'Entregar a domiciliario · En camino'));
          } else {
            b.push(boton('EN_CAMINO', 'Recibí el pedido · Salgo en camino'));
          }
        } else if (admin) {
          b.push(boton('ENTREGADO', 'Cliente recogió · Marcar entregado', 'btn-ok'));
        }
        break;
      case 'EN_CAMINO':
        b.push(boton('ENTREGADO', 'Marcar ENTREGADO', 'btn-ok'));
        break;
    }
    if (admin && p.estado !== 'ENTREGADO' && p.estado !== 'CANCELADO') {
      b.push('<button type="button" class="btn-danger-link" data-act="cancelar"' + dis + '>Cancelar pedido</button>');
    }
    return b.join('');
  }

  /* ---------- Acciones ---------- */
  function pintarDomis() {
    var lista = L.store.get(KEY_DOMIS, []);
    $('#domisList').innerHTML = (Array.isArray(lista) ? lista : []).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }
  function recordarDomi(nombre) {
    var lista = L.store.get(KEY_DOMIS, []);
    lista = (Array.isArray(lista) ? lista : []).filter(function (n) { return normal(n) !== normal(nombre); });
    lista.unshift(nombre);
    L.store.set(KEY_DOMIS, lista.slice(0, 15));
    pintarDomis();
  }

  function cambiar(p, estado, nota) {
    var datos = { clave: S.clave, codigo: p.codigo, estado: estado };
    var nombreDomi = ($('#domiNombre').value || '').trim();
    if (estado === 'EN_CAMINO') {
      var nombre = S.rol === 'admin' ? String(S.domiInput[p.codigo] || '').trim() : nombreDomi;
      if (!nombre) {
        L.toast(S.rol === 'admin' ? 'Escribe el nombre del domiciliario que recibe el pedido.' : 'Escribe tu nombre arriba para continuar.', 'error');
        var input = S.rol === 'admin' ? document.getElementById('dom-' + p.codigo) : $('#domiNombre');
        if (input) input.focus();
        return;
      }
      datos.domiciliario = nombre;
      if (S.rol === 'admin') recordarDomi(nombre);
    }
    if (S.rol === 'domiciliario') {
      if (!nombreDomi) { L.toast('Escribe tu nombre arriba para continuar.', 'error'); $('#domiNombre').focus(); return; }
      datos.usuario = nombreDomi;
    }
    if (estado === 'LISTO' && S.rol === 'admin') {
      var faltan = p.items.filter(function (it, i) { return !S.check[p.codigo + '|' + i]; }).length;
      if (faltan && !window.confirm('Hay ' + faltan + ' producto(s) sin marcar como alistados. ¿Marcar el pedido ' + p.codigo + ' como listo de todas formas?')) return;
    }
    if (estado === 'ENTREGADO' && !window.confirm('¿Confirmas que el pedido ' + p.codigo + ' fue ENTREGADO al cliente?')) return;
    if (nota) datos.nota = nota;

    S.ocupado[p.codigo] = true;
    render();
    API.call('actualizar', datos).then(function (r) {
      reemplazar(r.pedido);
      delete S.resaltar[p.codigo];
      delete S.domiInput[p.codigo];
      L.toast(p.codigo + ': ' + L.etiquetaEstado(r.pedido.estado, r.pedido.tipoEntrega), 'ok');
    }).catch(function (e) {
      L.toast(e.message, 'error');
      return cargar(true);
    }).then(function () {
      delete S.ocupado[p.codigo];
      render();
    });
  }

  /* ---------- Exportación XML ---------- */
  function x(v) {
    return String(v == null ? '' : v)
      .replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function autorizacion(s, fecha) {
    s = String(s || '');
    var v = s.match(/v([\w.\-]+)/), f = s.match(/\d{4}-\d{2}-\d{2}T[\d:]+(?:[+\-]\d{2}:\d{2}|Z)?/);
    return { aceptada: /^S[IÍ]/i.test(s), version: v ? v[1] : '', fecha: f ? f[0] : fecha };
  }
  function generarXML(pedidos) {
    var lista = pedidos.slice().sort(function (a, b) { return a.fecha < b.fecha ? -1 : 1; });
    var cuenta = {};
    L.ESTADOS.forEach(function (e) { cuenta[e] = 0; });
    lista.forEach(function (p) { cuenta[p.estado] = (cuenta[p.estado] || 0) + 1; });
    var ventas = lista.filter(function (p) { return p.estado === 'ENTREGADO'; }).reduce(function (s, p) { return s + Number(p.total || 0); }, 0);
    var o = [];
    o.push('<?xml version="1.0" encoding="UTF-8"?>');
    o.push('<pedidos negocio="' + x(N.razonSocial || 'Chocopez') + '" marca="LLEGO" generado="' + x(L.ahoraISO()) + '" moneda="COP" totalPedidos="' + lista.length + '">');
    o.push('  <resumen>');
    L.ESTADOS.forEach(function (e) {
      o.push('    <estado codigo="' + e + '" nombre="' + x(L.etiquetaEstado(e)) + '" cantidad="' + cuenta[e] + '"/>');
    });
    o.push('    <ventasEntregadas>' + ventas + '</ventasEntregadas>');
    o.push('  </resumen>');
    lista.forEach(function (p) {
      var a = autorizacion(p.autorizacion, p.fecha), dom = p.tipoEntrega === 'DOMICILIO';
      o.push('  <pedido codigo="' + x(p.codigo) + '" estado="' + x(p.estado) + '">');
      o.push('    <estadoDescripcion>' + x(L.etiquetaEstado(p.estado, p.tipoEntrega)) + '</estadoDescripcion>');
      o.push('    <fechaCreacion>' + x(p.fecha) + '</fechaCreacion>');
      o.push('    <ultimaActualizacion>' + x(p.actualizado) + '</ultimaActualizacion>');
      o.push('    <cliente>');
      o.push('      <nombre>' + x(p.cliente.nombre) + '</nombre>');
      o.push('      <telefono>' + x(p.cliente.telefono) + '</telefono>');
      o.push('      <correo>' + x(p.cliente.correo) + '</correo>');
      o.push('    </cliente>');
      o.push('    <entrega tipo="' + x(p.tipoEntrega) + '">');
      if (dom) {
        o.push('      <direccion>' + x(p.entrega.direccion) + '</direccion>');
        o.push('      <barrio>' + x(p.entrega.barrio) + '</barrio>');
        o.push('      <ciudad>' + x(p.entrega.ciudad) + '</ciudad>');
        o.push('      <indicaciones>' + x(p.entrega.indicaciones) + '</indicaciones>');
        o.push('      <franjaHoraria>' + x(p.entrega.franja) + '</franjaHoraria>');
        o.push('      <domiciliario>' + x(p.domiciliario) + '</domiciliario>');
      } else {
        o.push('      <fechaRecogida>' + x(p.entrega.fechaRecogida) + '</fechaRecogida>');
        o.push('      <franjaHoraria>' + x(p.entrega.franja) + '</franjaHoraria>');
      }
      o.push('    </entrega>');
      o.push('    <medioPago>' + x(p.pago) + '</medioPago>');
      o.push('    <productos lineas="' + p.items.length + '">');
      p.items.forEach(function (it) {
        o.push('      <producto id="' + x(it.id) + '">');
        o.push('        <nombre>' + x(it.nombre) + '</nombre>');
        o.push('        <unidad>' + x(it.unidad) + '</unidad>');
        o.push('        <cantidad>' + x(it.cantidad) + '</cantidad>');
        o.push('        <precioUnitario>' + x(it.precioUnitario) + '</precioUnitario>');
        o.push('        <subtotal>' + x(it.subtotal) + '</subtotal>');
        o.push('      </producto>');
      });
      o.push('    </productos>');
      o.push('    <totales>');
      o.push('      <subtotalProductos>' + x(p.subtotal) + '</subtotalProductos>');
      if (dom && (p.costoDomicilio == null || p.costoDomicilio === '')) o.push('      <costoDomicilio aConvenir="true"/>');
      else o.push('      <costoDomicilio>' + x(dom ? p.costoDomicilio : 0) + '</costoDomicilio>');
      o.push('      <total>' + x(p.total) + '</total>');
      o.push('    </totales>');
      o.push('    <observaciones>' + x(p.observaciones) + '</observaciones>');
      o.push('    <autorizacionDatos aceptada="' + a.aceptada + '" version="' + x(a.version) + '" fecha="' + x(a.fecha) + '"/>');
      o.push('    <historial>');
      (p.historial || []).forEach(function (ev) {
        o.push('      <evento estado="' + x(ev.estado) + '" fecha="' + x(ev.fecha) + '" responsable="' + x(ev.por) + '"' + (ev.nota ? ' nota="' + x(ev.nota) + '"' : '') + '/>');
      });
      o.push('    </historial>');
      o.push('  </pedido>');
    });
    o.push('</pedidos>');
    return o.join('\n');
  }

  function descargarXML() {
    var btn = $('#btnXML');
    btn.disabled = true;
    btn.textContent = 'Generando…';
    cargar(true).then(function () {
      var blob = new Blob([generarXML(S.pedidos)], { type: 'application/xml;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'pedidos-llego-' + L.ahoraISO().slice(0, 16).replace('T', '_').replace(':', 'h') + '.xml';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      L.toast('XML descargado · ' + S.pedidos.length + ' pedidos', 'ok');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Descargar XML';
    });
  }

  /* ---------- Eventos ---------- */
  function eventos() {
    $('#loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      activarAudio();
      var clave = $('#clave').value.trim();
      if (!clave) { mostrarLogin('Escribe la clave.'); return; }
      login(clave, $('#recordar').checked, false);
    });
    $('#btnSalir').addEventListener('click', salir);
    $('#btnRefrescar').addEventListener('click', function () { activarAudio(); cargar(false); });
    $('#btnXML').addEventListener('click', descargarXML);
    $('#tabs').addEventListener('click', function (e) {
      var t = e.target.closest('[data-tab]');
      if (!t) return;
      S.tab = t.dataset.tab;
      render();
    });
    $('#buscar').addEventListener('input', function (e) { S.q = e.target.value.trim(); render(); });
    $('#domiNombre').addEventListener('change', function (e) { L.store.set(KEY_DOMI, e.target.value.trim()); });

    $('#orders').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      var card = b.closest('.order'), p = card && buscarPedido(card.dataset.codigo);
      if (!p) return;
      if (b.dataset.act === 'estado') cambiar(p, b.dataset.estado);
      if (b.dataset.act === 'cancelar') {
        var motivo = window.prompt('¿Cancelar el pedido ' + p.codigo + '? Escribe el motivo (opcional) y confirma.');
        if (motivo === null) return;
        cambiar(p, 'CANCELADO', motivo.trim() || 'Cancelado por administración');
      }
    });
    $('#orders').addEventListener('change', function (e) {
      var c = e.target.closest('[data-check]');
      if (!c) return;
      S.check[c.dataset.check] = c.checked;
      c.closest('li').classList.toggle('done', c.checked);
    });
    $('#orders').addEventListener('input', function (e) {
      var d = e.target.closest('[data-domi]');
      if (d) S.domiInput[d.dataset.domi] = d.value;
    });
    $('#orders').addEventListener('focusout', function () {
      setTimeout(function () { if (S.pendiente && puedeRenderizar()) render(); }, 400);
    });

    $('#tiendaAbierta').addEventListener('change', function (e) {
      var v = e.target.checked;
      if (!v && !window.confirm('¿Pausar la tienda? Los clientes no podrán enviar pedidos nuevos hasta que la vuelvas a abrir.')) {
        e.target.checked = true;
        return;
      }
      API.call('tienda', { clave: S.clave, abiertos: v }).then(function (r) {
        S.abiertos = r.abiertos;
        render();
        L.toast(r.abiertos ? 'Tienda abierta: recibiendo pedidos' : 'Tienda pausada', 'ok');
      }).catch(function (err) {
        e.target.checked = !v;
        L.toast(err.message, 'error');
      });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && S.clave) cargar(true);
    });
    document.addEventListener('pointerdown', activarAudio, { once: true });
  }

  function init() {
    eventos();
    var clave = L.session.get(KEY_SES, '') || L.store.get(KEY_SES, '');
    if (clave) {
      $('#vistaLogin').hidden = true;
      login(clave, !!L.store.get(KEY_SES, ''), true);
    } else {
      mostrarLogin();
    }
  }

  init();
})();
