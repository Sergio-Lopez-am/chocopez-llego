/* LLEGO · Chocopez — portafolio interactivo y carrito de compra */
(function () {
  'use strict';
  var L = window.LLEGO, API = window.LLEGO_API;
  var CFG = window.LLEGO_CONFIG || {}, N = CFG.NEGOCIO || {};
  var $ = L.$, $$ = L.$$;
  var KEY_CART = 'llego_carrito_v1', KEY_MIS = 'llego_mis_pedidos';
  var MAX = 50;

  var S = {
    productos: (window.LLEGO_PRODUCTOS || []).map(function (p) { return Object.assign({ disponible: true }, p); }),
    sel: {},
    carrito: [],
    costoDomicilio: null,
    abiertos: true,
    vista: 'carrito',
    enviando: false,
    ultimo: null
  };

  /* ---------- Productos ---------- */
  function prod(id) {
    for (var i = 0; i < S.productos.length; i++) if (S.productos[i].id === id) return S.productos[i];
    return null;
  }
  function precio(p, u) { return u === 'KILO' ? p.precioKilo : p.precioLibra; }
  function sel(p) {
    var s = S.sel[p.id];
    if (!s || !precio(p, s.unidad)) s = S.sel[p.id] = { unidad: p.precioLibra ? 'LIBRA' : 'KILO', cantidad: s ? s.cantidad : 1 };
    return s;
  }
  function cardDe(id) { return $$('#productGrid .card').filter(function (c) { return c.dataset.id === id; })[0]; }

  function tarjeta(p) {
    var s = sel(p);
    var bloqueado = !p.disponible || !S.abiertos;
    var media = p.imagen
      ? '<img src="' + L.esc(p.imagen) + '" alt="' + L.esc(p.nombre) + '" loading="lazy" width="720" height="540">'
      : '<div class="ph" aria-hidden="true">LLEGO</div>';
    function precioBox(u, label) {
      var v = precio(p, u);
      return '<div><span>' + label + '</span><strong>' + (v ? L.dinero(v) : '—') + '</strong></div>';
    }
    return '' +
      '<article class="card' + (p.disponible ? '' : ' is-out') + '" data-id="' + L.esc(p.id) + '">' +
        '<div class="card-media">' + media + (p.disponible ? '' : '<span class="tag-out">Agotado</span>') + '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + L.esc(p.nombre) + '</h3>' +
          (p.descripcion ? '<p class="card-desc">' + L.esc(p.descripcion) + '</p>' : '') +
          '<div class="prices">' + precioBox('LIBRA', 'Libra') + precioBox('KILO', 'Kilo') + '</div>' +
          '<div class="seg" role="group" aria-label="Unidad de venta de ' + L.esc(p.nombre) + '">' +
            '<button type="button" data-act="unidad" data-u="LIBRA" aria-pressed="' + (s.unidad === 'LIBRA') + '"' + (p.precioLibra ? '' : ' disabled') + '>Por libra</button>' +
            '<button type="button" data-act="unidad" data-u="KILO" aria-pressed="' + (s.unidad === 'KILO') + '"' + (p.precioKilo ? '' : ' disabled') + '>Por kilo</button>' +
          '</div>' +
          '<div class="card-row">' +
            '<div class="stepper" role="group" aria-label="Cantidad">' +
              '<button type="button" data-act="menos" aria-label="Quitar uno"' + (s.cantidad <= 1 ? ' disabled' : '') + '>&minus;</button>' +
              '<output aria-live="polite">' + s.cantidad + '</output>' +
              '<button type="button" data-act="mas" aria-label="Agregar uno"' + (s.cantidad >= MAX ? ' disabled' : '') + '>+</button>' +
            '</div>' +
            '<div class="line-total"><span>Total</span><strong>' + L.dinero(precio(p, s.unidad) * s.cantidad) + '</strong></div>' +
          '</div>' +
          '<button type="button" class="btn btn-primary btn-block" data-act="agregar"' + (bloqueado ? ' disabled' : '') + '>' +
            (p.disponible ? 'Agregar al pedido' : 'Agotado') + '</button>' +
        '</div>' +
      '</article>';
  }

  function renderCatalogo() {
    $('#productGrid').innerHTML = S.productos.map(tarjeta).join('');
    $('#closedNotice').hidden = S.abiertos;
  }

  function actualizarTarjeta(id) {
    var p = prod(id), el = cardDe(id);
    if (!p || !el) return;
    var s = sel(p);
    el.querySelector('output').textContent = s.cantidad;
    $$('[data-act="unidad"]', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.u === s.unidad)); });
    el.querySelector('[data-act="menos"]').disabled = s.cantidad <= 1;
    el.querySelector('[data-act="mas"]').disabled = s.cantidad >= MAX;
    el.querySelector('.line-total strong').textContent = L.dinero(precio(p, s.unidad) * s.cantidad);
  }

  /* ---------- Carrito ---------- */
  function cargarCarrito() {
    var c = L.store.get(KEY_CART, []);
    S.carrito = (Array.isArray(c) ? c : []).filter(function (l) {
      var p = l && prod(l.id);
      return p && (l.unidad === 'LIBRA' || l.unidad === 'KILO') && precio(p, l.unidad) && Number(l.cantidad) >= 1;
    }).map(function (l) { return { id: l.id, unidad: l.unidad, cantidad: Math.min(MAX, Math.floor(Number(l.cantidad))) }; });
  }
  function guardarCarrito() { L.store.set(KEY_CART, S.carrito); }
  function subtotal() {
    return S.carrito.reduce(function (s, l) { var p = prod(l.id); return s + (p ? precio(p, l.unidad) * l.cantidad : 0); }, 0);
  }
  function hayAgotados() {
    return S.carrito.some(function (l) { var p = prod(l.id); return !p || !p.disponible; });
  }
  function tipoEntrega() {
    var r = $('input[name="tipoEntrega"]:checked');
    return r ? r.value : 'DOMICILIO';
  }

  function agregar(p, s) {
    if (!S.abiertos || !p.disponible) return;
    var linea = S.carrito.filter(function (x) { return x.id === p.id && x.unidad === s.unidad; })[0];
    if (linea) linea.cantidad = Math.min(MAX, linea.cantidad + s.cantidad);
    else S.carrito.push({ id: p.id, unidad: s.unidad, cantidad: s.cantidad });
    guardarCarrito();
    L.toast('Agregado: ' + L.cantidadTxt(s.cantidad, s.unidad) + ' de ' + p.nombre, 'ok');
    var btn = $('#cartBtn');
    btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump');
    s.cantidad = 1;
    actualizarTarjeta(p.id);
    actualizarResumen();
  }

  function actualizarResumen() {
    var n = S.carrito.length, total = subtotal();
    $('#cartCount').textContent = n;
    $('#cartTotalTop').textContent = n ? L.dinero(total) : 'Mi pedido';
    $('#mbCount').textContent = n + (n === 1 ? ' producto' : ' productos');
    $('#mbTotal').textContent = L.dinero(total);
    $('#mobileBar').classList.toggle('has-items', n > 0 && !$('#drawer').classList.contains('open'));
    if ($('#drawer').classList.contains('open')) {
      if (S.vista === 'carrito') renderCarrito();
      renderPie();
    }
  }

  /* ---------- Panel lateral del pedido ---------- */
  var TITULOS = { carrito: 'Tu pedido', datos: 'Datos de entrega', listo: 'Pedido enviado' };
  var ORDEN = ['carrito', 'datos', 'listo'];

  function abrir(vista) {
    S.vista = vista || 'carrito';
    var d = $('#drawer');
    d.classList.add('open');
    d.setAttribute('aria-hidden', 'false');
    $('#backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    renderDrawer();
    actualizarResumen();
    setTimeout(function () { $('#drawerClose').focus(); }, 50);
  }
  function cerrar() {
    var d = $('#drawer');
    d.classList.remove('open');
    d.setAttribute('aria-hidden', 'true');
    $('#backdrop').hidden = true;
    document.body.style.overflow = '';
    if (S.vista === 'listo') S.vista = 'carrito';
    actualizarResumen();
    $('#cartBtn').focus();
  }
  function irA(vista) {
    S.vista = vista;
    renderDrawer();
    $('#drawerBody').scrollTop = 0;
  }
  function renderDrawer() {
    $$('#drawerBody [data-view]').forEach(function (sec) { sec.hidden = sec.dataset.view !== S.vista; });
    $('#drawerTitle').textContent = TITULOS[S.vista];
    $('#drawerBack').hidden = S.vista !== 'datos';
    var idx = ORDEN.indexOf(S.vista);
    $$('#drawerSteps span').forEach(function (s, i) { s.classList.toggle('on', i <= idx); });
    if (S.vista === 'carrito') renderCarrito();
    if (S.vista === 'datos') aplicarTipo();
    if (S.vista === 'listo') renderListo();
    renderPie();
  }

  function renderCarrito() {
    var v = $('#viewCarrito');
    if (!S.carrito.length) {
      v.innerHTML = '<div class="empty"><h3>Tu pedido está vacío</h3><p class="muted">Agrega productos por libra o por kilo.</p>' +
        '<button type="button" class="btn btn-primary" data-act="ver-productos">Ver productos</button></div>';
      return;
    }
    v.innerHTML = S.carrito.map(function (l, i) {
      var p = prod(l.id), pu = precio(p, l.unidad);
      var img = p.imagen ? '<img src="' + L.esc(p.imagen) + '" alt="">' : '<div class="thumb-ph"></div>';
      return '<div class="cart-line" data-i="' + i + '">' + img +
        '<div><h4>' + L.esc(p.nombre) + '</h4>' +
          '<p class="meta">Por ' + L.unidad(l.unidad, 1) + ' · ' + L.dinero(pu) + '</p>' +
          '<div class="stepper sm" role="group" aria-label="Cantidad de ' + L.esc(p.nombre) + '">' +
            '<button type="button" data-act="menos" aria-label="Quitar uno"' + (l.cantidad <= 1 ? ' disabled' : '') + '>&minus;</button>' +
            '<output>' + l.cantidad + '</output>' +
            '<button type="button" data-act="mas" aria-label="Agregar uno"' + (l.cantidad >= MAX ? ' disabled' : '') + '>+</button>' +
          '</div>' +
          (p.disponible ? '' : '<p class="meta" style="color:var(--danger);font-weight:700;margin-top:8px">Agotado: quítalo para continuar.</p>') +
        '</div>' +
        '<div class="right"><strong>' + L.dinero(pu * l.cantidad) + '</strong>' +
          '<button type="button" class="link-remove" data-act="quitar">Quitar</button></div>' +
      '</div>';
    }).join('');
  }

  function renderPie() {
    var foot = $('#drawerFoot');
    if (S.vista === 'listo' || (S.vista === 'carrito' && !S.carrito.length)) { foot.hidden = true; return; }
    foot.hidden = false;
    var sub = subtotal(), html = '';
    var domicilio = S.vista === 'datos' && tipoEntrega() === 'DOMICILIO';
    if (domicilio) {
      html += '<div><span>Productos</span><strong>' + L.dinero(sub) + '</strong></div>';
      html += '<div><span>Domicilio</span><strong>' + L.costoDomTxt(S.costoDomicilio) + '</strong></div>';
    }
    var total = sub + (domicilio && S.costoDomicilio ? Number(S.costoDomicilio) : 0);
    html += '<div class="grand"><span>Total</span><span>' + L.dinero(total) + '</span></div>';
    $('#totals').innerHTML = html;
    var btn = $('#primaryBtn');
    btn.textContent = S.vista === 'carrito' ? 'Continuar' : (S.enviando ? 'Enviando pedido…' : 'Enviar pedido');
    btn.disabled = S.enviando || !S.abiertos || hayAgotados();
  }

  /* ---------- Formulario de entrega ---------- */
  function opciones(lista) {
    return (lista || []).map(function (o) { return '<option>' + L.esc(o) + '</option>'; }).join('');
  }
  function prepararFormulario() {
    $('#fFranja').innerHTML = opciones(CFG.FRANJAS_DOMICILIO);
    $('#fFranjaRecogida').innerHTML = opciones(CFG.FRANJAS_RECOGIDA);
    $('#pagoList').innerHTML = (CFG.PAGOS || []).map(function (p, i) {
      return '<label><input type="radio" name="pago" value="' + L.esc(p) + '"' + (i === 0 ? ' checked' : '') + '> ' + L.esc(p) + '</label>';
    }).join('');
    if (N.ciudad) $('#fCiudad').value = N.ciudad;
    var hoy = L.hoyISO(), f = $('#fFechaRecogida');
    f.min = hoy; f.max = L.sumarDias(hoy, 7); f.value = hoy;

    var info = [];
    if (N.direccionRecogida) info.push('<strong>' + L.esc(N.direccionRecogida) + '</strong>');
    if (N.ciudad) info.push('<span>' + L.esc(N.ciudad) + '</span>');
    if (N.horarioRecogida) info.push('<span>Horario: ' + L.esc(N.horarioRecogida) + '</span>');
    if (!N.direccionRecogida) info.push('<span>Te confirmaremos la dirección exacta del punto de recogida por llamada o WhatsApp.</span>');
    info.push('<span class="muted">Presenta tu código de pedido al recoger.</span>');
    $('#pickupInfo').innerHTML = info.join('');
    if (N.coberturaDomicilio) {
      var h = $('#coberturaHint');
      h.textContent = 'Cobertura de domicilios: ' + N.coberturaDomicilio;
      h.hidden = false;
    }
  }
  function aplicarTipo() {
    var t = tipoEntrega();
    $$('#checkoutForm [data-solo]').forEach(function (fs) { fs.hidden = fs.dataset.solo !== t; });
    renderPie();
  }
  function limpiarErrores() {
    $('#formError').hidden = true;
    $$('#checkoutForm .invalid').forEach(function (el) { el.classList.remove('invalid'); });
    $$('#checkoutForm .field-msg').forEach(function (el) { el.remove(); });
  }
  function mostrarError(msg, campo) {
    var box = $('#formError');
    box.textContent = msg;
    box.hidden = false;
    var cont = campo ? $('#checkoutForm [data-campo="' + campo + '"]') : null;
    if (cont) {
      cont.classList.add('invalid');
      if (cont.classList.contains('field')) {
        var m = document.createElement('p');
        m.className = 'field-msg';
        m.textContent = msg;
        cont.appendChild(m);
      }
      var input = cont.querySelector('input, select, textarea');
      if (input) input.focus({ preventScroll: true });
      cont.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function enviar() {
    if (S.enviando) return;
    var f = $('#checkoutForm');
    var v = function (n) { var el = f.elements[n]; return el ? el.value : ''; };
    var pagoSel = $('input[name="pago"]:checked', f);
    var datos = {
      tipoEntrega: tipoEntrega(),
      nombre: v('nombre'), telefono: v('telefono'), correo: v('correo'),
      direccion: v('direccion'), barrio: v('barrio'), ciudad: v('ciudad'), indicaciones: v('indicaciones'), franja: v('franja'),
      fechaRecogida: v('fechaRecogida'), franjaRecogida: v('franjaRecogida'),
      pago: pagoSel ? pagoSel.value : '',
      observaciones: v('observaciones'),
      consentimiento: $('#fConsent').checked,
      versionPolitica: CFG.VERSION_POLITICA || '1.0',
      web: v('web'),
      items: S.carrito.map(function (l) { return { id: l.id, unidad: l.unidad, cantidad: l.cantidad }; })
    };
    limpiarErrores();
    var val = L.validarPedido(datos, S.productos, { costoDomicilio: S.costoDomicilio });
    if (val.error) { mostrarError(val.error, val.campo); return; }

    S.enviando = true;
    renderPie();
    API.call('crearPedido', { pedido: datos }).then(function (r) {
      S.ultimo = { r: r, pedido: val.pedido };
      var mis = L.store.get(KEY_MIS, []);
      mis = (Array.isArray(mis) ? mis : []).filter(function (m) { return m.codigo !== r.codigo; });
      mis.unshift({ codigo: r.codigo, token: r.token, fecha: r.fecha, total: r.total });
      L.store.set(KEY_MIS, mis.slice(0, 10));
      S.carrito = [];
      guardarCarrito();
      f.reset();
      prepararFormulario();
      aplicarTipo();
      irA('listo');
      actualizarResumen();
    }).catch(function (e) {
      mostrarError(e.message || 'No se pudo enviar el pedido. Intenta de nuevo.');
    }).then(function () {
      S.enviando = false;
      renderPie();
    });
  }

  function renderListo() {
    var u = S.ultimo;
    if (!u) return;
    var r = u.r, p = u.pedido;
    var link = 'seguimiento.html?pedido=' + encodeURIComponent(r.codigo) + '&t=' + encodeURIComponent(r.token);
    var entrega = p.tipoEntrega === 'DOMICILIO'
      ? 'Domicilio · ' + p.entrega.franja
      : 'Recoger · ' + L.fechaLarga(p.entrega.fechaRecogida) + ', ' + p.entrega.franja;
    var filas = [
      ['Entrega', entrega],
      ['Productos', p.items.length + (p.items.length === 1 ? ' producto' : ' productos')]
    ];
    if (p.tipoEntrega === 'DOMICILIO') filas.push(['Domicilio', L.costoDomTxt(r.costoDomicilio)]);
    filas.push(['Total', L.dinero(r.total)], ['Pago', p.pago]);
    var wa = '';
    if (N.whatsapp) {
      var msg = 'Hola, acabo de hacer el pedido ' + r.codigo + ' en LLEGO por ' + L.dinero(r.total) + '.';
      wa = '<a class="btn btn-ghost btn-block" target="_blank" rel="noopener" href="https://wa.me/' + encodeURIComponent(N.whatsapp) + '?text=' + encodeURIComponent(msg) + '">Escribirnos por WhatsApp</a>';
    }
    $('#viewListo').innerHTML =
      '<div class="success">' +
        '<div class="success-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>' +
        '<h3 style="font-size:26px">¡Pedido recibido!</h3>' +
        '<p class="muted">Tu código de pedido es</p>' +
        '<div class="code">' + L.esc(r.codigo) + '</div>' +
        '<p class="muted small">Guárdalo para consultar el estado de tu pedido. Si necesitamos confirmar algo te contactaremos al ' + L.esc(L.telefonoFmt(p.cliente.telefono)) + '.</p>' +
        '<dl class="summary">' + filas.map(function (f) { return '<div><dt>' + L.esc(f[0]) + '</dt><dd>' + L.esc(f[1]) + '</dd></div>'; }).join('') + '</dl>' +
        '<a class="btn btn-primary btn-block btn-lg" href="' + link + '">Ver estado de mi pedido</a>' +
        wa +
        '<button type="button" class="btn btn-ghost btn-block" data-act="cerrar">Volver a la tienda</button>' +
      '</div>';
  }

  /* ---------- Datos del negocio en la página ---------- */
  function pintarNegocio() {
    $$('[data-negocio]').forEach(function (el) { var v = N[el.dataset.negocio]; if (v) el.textContent = v; });
    $('#anio').textContent = new Date().getFullYear();
    var c = [];
    if (N.telefono) c.push('<li>Tel. <a href="tel:' + L.esc(String(N.telefono).replace(/\s/g, '')) + '">' + L.esc(N.telefono) + '</a></li>');
    if (N.whatsapp) c.push('<li><a href="https://wa.me/' + encodeURIComponent(N.whatsapp) + '" target="_blank" rel="noopener">WhatsApp</a></li>');
    if (N.correo) c.push('<li><a href="mailto:' + L.esc(N.correo) + '">' + L.esc(N.correo) + '</a></li>');
    if (N.direccionRecogida) c.push('<li>' + L.esc(N.direccionRecogida) + (N.ciudad ? ', ' + L.esc(N.ciudad) : '') + '</li>');
    if (N.horarioRecogida) c.push('<li>' + L.esc(N.horarioRecogida) + '</li>');
    if (!c.length) c.push('<li class="muted">Datos de contacto próximamente.</li>');
    $('#footerContact').innerHTML = c.join('');
  }

  /* ---------- Eventos ---------- */
  function eventos() {
    $('#productGrid').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      var card = b.closest('.card'), p = card && prod(card.dataset.id);
      if (!p) return;
      var s = sel(p);
      switch (b.dataset.act) {
        case 'unidad': s.unidad = b.dataset.u; break;
        case 'menos': s.cantidad = Math.max(1, s.cantidad - 1); break;
        case 'mas': s.cantidad = Math.min(MAX, s.cantidad + 1); break;
        case 'agregar': agregar(p, s); return;
      }
      actualizarTarjeta(p.id);
    });

    $('#viewCarrito').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'ver-productos') { cerrar(); $('#catalogo').scrollIntoView({ behavior: 'smooth' }); return; }
      var linea = b.closest('.cart-line'), i = linea ? Number(linea.dataset.i) : -1, l = S.carrito[i];
      if (!l) return;
      if (b.dataset.act === 'menos') l.cantidad = Math.max(1, l.cantidad - 1);
      if (b.dataset.act === 'mas') l.cantidad = Math.min(MAX, l.cantidad + 1);
      if (b.dataset.act === 'quitar') S.carrito.splice(i, 1);
      guardarCarrito();
      actualizarResumen();
    });

    $('#viewListo').addEventListener('click', function (e) {
      if (e.target.closest('[data-act="cerrar"]')) cerrar();
    });

    $('#cartBtn').addEventListener('click', function () { abrir('carrito'); });
    $('#mobileBar').addEventListener('click', function () { abrir('carrito'); });
    $('#drawerClose').addEventListener('click', cerrar);
    $('#backdrop').addEventListener('click', cerrar);
    $('#drawerBack').addEventListener('click', function () { irA('carrito'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#drawer').classList.contains('open')) cerrar();
    });

    $('#primaryBtn').addEventListener('click', function () {
      if (S.vista === 'carrito') { if (S.carrito.length) irA('datos'); }
      else if (S.vista === 'datos') enviar();
    });

    $$('input[name="tipoEntrega"]').forEach(function (r) { r.addEventListener('change', aplicarTipo); });
    $('#checkoutForm').addEventListener('submit', function (e) { e.preventDefault(); enviar(); });
    $('#checkoutForm').addEventListener('input', function (e) {
      var c = e.target.closest('.invalid');
      if (!c) return;
      c.classList.remove('invalid');
      var m = c.querySelector('.field-msg');
      if (m) m.remove();
    });
  }

  /* ---------- Catálogo en línea (precios y disponibilidad desde Google Sheets) ---------- */
  function sincronizarCatalogo() {
    API.call('catalogo').then(function (c) {
      S.abiertos = c.abiertos !== false;
      S.costoDomicilio = (c.costoDomicilio == null || c.costoDomicilio === '') ? null : Number(c.costoDomicilio);
      if (Array.isArray(c.productos) && c.productos.length) {
        var base = {};
        S.productos.forEach(function (p) { base[p.id] = p; });
        S.productos = c.productos.map(function (r) {
          var b = base[r.id] || { id: r.id, descripcion: '', imagen: '' };
          return Object.assign({}, b, {
            nombre: r.nombre || b.nombre,
            precioLibra: Number(r.precioLibra) || 0,
            precioKilo: Number(r.precioKilo) || 0,
            disponible: r.disponible !== false
          });
        });
      }
      cargarCarrito();
      renderCatalogo();
      actualizarResumen();
    }).catch(function () {
      if (!API.demo) L.toast('No pudimos actualizar precios en línea. Intenta recargar la página.', 'error');
    });
  }

  function init() {
    $('#demoBanner').hidden = !API.demo;
    pintarNegocio();
    prepararFormulario();
    cargarCarrito();
    renderCatalogo();
    eventos();
    actualizarResumen();
    sincronizarCatalogo();
  }

  init();
})();
