/* LLEGO · Chocopez — seguimiento del pedido para el cliente */
(function () {
  'use strict';
  var L = window.LLEGO, API = window.LLEGO_API;
  var N = (window.LLEGO_CONFIG || {}).NEGOCIO || {};
  var $ = L.$;
  var KEY_MIS = 'llego_mis_pedidos';
  var consulta = null, timer = null;

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

  function descripcion(d) {
    switch (d.estado) {
      case 'RECIBIDO': return 'Recibimos tu pedido. En breve empezamos a alistarlo.';
      case 'ALISTAMIENTO': return 'Estamos seleccionando y empacando tus productos.';
      case 'LISTO': return d.tipoEntrega === 'RECOGER'
        ? 'Tu pedido está listo. Puedes pasar a recogerlo con tu código.'
        : 'Tu pedido está listo y espera al domiciliario.';
      case 'EN_CAMINO': return 'Tu pedido va en camino' + (d.domiciliario ? ' con ' + d.domiciliario : '') + '. Ten tu celular a la mano.';
      case 'ENTREGADO': return '¡Pedido entregado! Gracias por comprar en LLEGO.';
      case 'CANCELADO': return 'Este pedido fue cancelado. Si tienes dudas, contáctanos.';
      default: return '';
    }
  }

  function fechaDe(historial, estado) {
    var f = '';
    (historial || []).forEach(function (h) { if (h.estado === estado) f = h.fecha; });
    return f;
  }

  function render(d) {
    $('#vistaForm').hidden = true;
    $('#vistaPedido').hidden = false;
    $('#pCodigo').textContent = 'Pedido ' + d.codigo;
    $('#pEstado').textContent = L.etiquetaEstado(d.estado, d.tipoEntrega);
    $('#pDescripcion').textContent = descripcion(d);
    $('#pActualizado').textContent = 'Consultado a las ' + L.hora(L.ahoraISO());

    var tl = $('#pTimeline');
    if (d.estado === 'CANCELADO') {
      tl.innerHTML = '<li class="current"><span class="dot"></span><div><div class="t-title">Cancelado</div><div class="t-time">' + L.esc(L.fechaHora(fechaDe(d.historial, 'CANCELADO'))) + '</div></div></li>';
    } else {
      var pasos = L.pasos(d.tipoEntrega), idx = pasos.indexOf(d.estado);
      tl.innerHTML = pasos.map(function (s, i) {
        var cls = i < idx || (i === idx && s === 'ENTREGADO') ? 'done' : (i === idx ? 'current' : '');
        var f = i <= idx ? fechaDe(d.historial, s) : '';
        return '<li class="' + cls + '"><span class="dot">' + CHECK + '</span><div>' +
          '<div class="t-title">' + L.esc(L.etiquetaEstado(s, d.tipoEntrega)) + '</div>' +
          (f ? '<div class="t-time">' + L.esc(L.fechaHora(f)) + '</div>' : '') +
          '</div></li>';
      }).join('');
    }

    var filas = [];
    filas.push(['Realizado', L.fechaHora(d.fecha)]);
    if (d.tipoEntrega === 'DOMICILIO') {
      filas.push(['Entrega', 'Domicilio' + (d.barrio ? ' · ' + d.barrio : '')]);
      if (d.franja) filas.push(['Horario', d.franja]);
      if (d.domiciliario && (d.estado === 'EN_CAMINO' || d.estado === 'ENTREGADO')) filas.push(['Domiciliario', d.domiciliario]);
    } else {
      filas.push(['Entrega', 'Recoger en sitio']);
      if (d.fechaRecogida) filas.push(['Recoger el', L.fechaLarga(d.fechaRecogida) + (d.franja ? ' · ' + d.franja : '')]);
      if (N.direccionRecogida) filas.push(['Dirección', N.direccionRecogida]);
    }
    filas.push(['Pago', d.pago]);
    if (d.tipoEntrega === 'DOMICILIO') filas.push(['Domicilio', L.costoDomTxt(d.costoDomicilio)]);
    filas.push(['Total', L.dinero(d.total)]);
    $('#pDatos').innerHTML = filas.map(function (f) {
      return '<div><span>' + L.esc(f[0]) + '</span><span>' + L.esc(f[1]) + '</span></div>';
    }).join('');

    $('#pItems').innerHTML = (d.items || []).map(function (i) {
      return '<li><span><strong>' + L.esc(L.cantidadTxt(i.cantidad, i.unidad)) + '</strong> · ' + L.esc(i.nombre) + '</span><span>' + L.dinero(i.subtotal) + '</span></li>';
    }).join('');
    document.title = L.etiquetaEstado(d.estado, d.tipoEntrega) + ' · Pedido ' + d.codigo + ' · LLEGO';
  }

  function guardarEnMisPedidos(d) {
    var mis = L.store.get(KEY_MIS, []);
    mis = (Array.isArray(mis) ? mis : []).filter(function (m) { return m.codigo !== d.codigo; });
    mis.unshift({ codigo: d.codigo, token: d.token, fecha: d.fecha, total: d.total });
    L.store.set(KEY_MIS, mis.slice(0, 10));
  }

  function programar(d) {
    clearInterval(timer);
    if (d.estado === 'ENTREGADO' || d.estado === 'CANCELADO') return;
    timer = setInterval(function () {
      if (document.visibilityState === 'visible') consultar(consulta, true);
    }, 30000);
  }

  function consultar(q, silencioso) {
    var btn = $('#trackBtn');
    if (!silencioso) { btn.disabled = true; btn.textContent = 'Consultando…'; }
    return API.call('seguimiento', q).then(function (d) {
      consulta = { codigo: d.codigo, token: d.token };
      guardarEnMisPedidos(d);
      try { history.replaceState(null, '', '?pedido=' + encodeURIComponent(d.codigo) + '&t=' + encodeURIComponent(d.token)); } catch (e) { /* sin historial */ }
      render(d);
      programar(d);
    }).catch(function (e) {
      if (silencioso) return;
      mostrarFormulario(q && q.codigo);
      var box = $('#trackError');
      box.textContent = e.message;
      box.hidden = false;
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Consultar estado';
    });
  }

  function mostrarFormulario(codigo) {
    clearInterval(timer);
    $('#vistaPedido').hidden = true;
    $('#vistaForm').hidden = false;
    if (codigo) $('#tCodigo').value = codigo;
    var mis = L.store.get(KEY_MIS, []);
    if (Array.isArray(mis) && mis.length) {
      $('#misPedidos').innerHTML = '<h3 style="margin-bottom:10px">Tus pedidos recientes</h3><div class="kv" style="margin-top:0">' +
        mis.map(function (m) {
          return '<div><span><a href="?pedido=' + encodeURIComponent(m.codigo) + '&t=' + encodeURIComponent(m.token) + '" style="font-weight:800;color:var(--ink)">' + L.esc(m.codigo) + '</a> · ' + L.esc(L.fechaHora(m.fecha)) + '</span><span>' + L.dinero(m.total) + '</span></div>';
        }).join('') + '</div>';
    }
  }

  function init() {
    $('#demoBanner').hidden = !API.demo;
    var params = new URLSearchParams(location.search);
    var codigo = (params.get('pedido') || '').toUpperCase(), token = params.get('t') || '';
    if (codigo && token) consultar({ codigo: codigo, token: token });
    else mostrarFormulario(codigo);

    $('#trackForm').addEventListener('submit', function (e) {
      e.preventDefault();
      $('#trackError').hidden = true;
      var cod = $('#tCodigo').value.trim().toUpperCase().replace(/\s/g, '');
      if (/^\d+$/.test(cod)) cod = 'LL-' + ('000' + cod).slice(-4);
      if (/^LL\d+$/.test(cod)) cod = 'LL-' + cod.slice(2);
      var tel = L.normalizarTelefono($('#tTelefono').value);
      var box = $('#trackError');
      if (!cod) { box.textContent = 'Escribe el código de tu pedido.'; box.hidden = false; return; }
      if (!tel) { box.textContent = 'Escribe el celular de 10 dígitos con el que hiciste el pedido.'; box.hidden = false; return; }
      consultar({ codigo: cod, telefono: tel });
    });
    $('#btnActualizar').addEventListener('click', function () {
      if (consulta) consultar(consulta, true).then(function () { L.toast('Estado actualizado'); });
    });
    $('#btnOtro').addEventListener('click', function () {
      consulta = null;
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* sin historial */ }
      $('#tCodigo').value = '';
      $('#tTelefono').value = '';
      mostrarFormulario();
    });
  }

  init();
})();
