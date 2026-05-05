// =====================================================
// DASHBOARD FINANCIERO - LÓGICA PRINCIPAL
// =====================================================

let resumenActual = null;
let autoRefreshInterval = null;

// Inicializar dashboard al cargar
document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    setupDashboardEventListeners();
    startAutoRefresh();
});

/**
 * Inicializa el dashboard
 */
async function initDashboard() {
    if (window.contabilidadAuth && typeof window.contabilidadAuth.ensureSession === 'function') {
        await window.contabilidadAuth.ensureSession();
    }
    updateCurrentDate();
    await cargarDatosDashboard();
}

/**
 * Actualiza la fecha actual en el header
 */
function updateCurrentDate() {
    const now = new Date();
    const formatted = now.toLocaleDateString('es-EC', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('currentDate').textContent = formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Configurar event listeners del dashboard
 */
function setupDashboardEventListeners() {
    // Botón de refresh
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        await cargarDatosDashboard();
    });
}

/**
 * Carga todos los datos del dashboard
 */
async function cargarDatosDashboard() {
    showLoading(true);

    try {
        // Calcular resumen diario
        resumenActual = await calcularResumenDiario();

        // Actualizar UI
        actualizarMetricas(resumenActual);
        mostrarAlertas(resumenActual);

        console.log('Dashboard actualizado:', resumenActual);
    } catch (error) {
        console.error('Error al cargar dashboard:', error);
        mostrarError('Error al cargar los datos del dashboard. Por favor, recarga la página.');
    } finally {
        showLoading(false);
    }
}

/**
 * Actualiza las métricas principales
 */
function actualizarMetricas(resumen) {
    // Ventas
    document.getElementById('totalVentas').textContent = formatCurrency(resumen.ventas.total);
    document.getElementById('ventasEfectivo').textContent = formatCurrency(resumen.ventas.efectivo);
    document.getElementById('ventasCredito').textContent = formatCurrency(resumen.ventas.credito);
    document.getElementById('cantidadVentas').textContent = `${resumen.ventas.cantidad} transacción${resumen.ventas.cantidad !== 1 ? 'es' : ''}`;

    // Ingresos
    document.getElementById('totalIngresos').textContent = formatCurrency(resumen.ingresos.total);
    document.getElementById('ingresosVentas').textContent = formatCurrency(resumen.ingresos.ventas);
    document.getElementById('pagosCxC').textContent = formatCurrency(resumen.ingresos.pagosCxC);
    document.getElementById('ingresosTransferencias').textContent = formatCurrency(resumen.ingresos.transferencias);
    const otrosIngresosEl = document.getElementById('otrosIngresos');
    if (otrosIngresosEl) {
        otrosIngresosEl.textContent = formatCurrency(resumen.ingresos.otros || 0);
    }
    document.getElementById('cantidadIngresos').textContent = `${resumen.ingresos.cantidad} movimiento${resumen.ingresos.cantidad !== 1 ? 's' : ''}`;

    // Egresos
    document.getElementById('totalEgresos').textContent = formatCurrency(resumen.egresos.total);
    document.getElementById('pagosProveedores').textContent = formatCurrency(resumen.egresos.proveedores);
    document.getElementById('gastosVarios').textContent = formatCurrency(resumen.egresos.gastos);
    document.getElementById('cantidadEgresos').textContent = `${resumen.egresos.cantidad} movimiento${resumen.egresos.cantidad !== 1 ? 's' : ''}`;

    // Transferencias
    document.getElementById('netoTransferencias').textContent = formatCurrency(resumen.transferencias.neto);
    document.getElementById('transferenciasIngresos').textContent = formatCurrency(resumen.transferencias.totalIngresos);
    document.getElementById('transferenciasEgresos').textContent = formatCurrency(resumen.transferencias.totalEgresos);

    // Actualizar conciliación
    actualizarConciliacion(resumen);
}

/**
 * Actualiza el panel de conciliación
 */
function actualizarConciliacion(resumen) {
    const cajaf = resumen.caja.fisica;
    const cajav = resumen.caja.virtual;

    document.getElementById('concilVentasEfectivo').textContent = formatCurrency(cajaf.ingresos.ventas);
    document.getElementById('concilPagosCxC').textContent = formatCurrency(cajaf.ingresos.pagosCxC);
    document.getElementById('concilOtrosIngresos').textContent = formatCurrency(cajaf.ingresos.otros || 0);
    document.getElementById('concilTransfIngresos').textContent = formatCurrency(cajav.ingresos.transferencias + cajav.ingresos.pagosCxC);
    document.getElementById('concilPagosProveedores').textContent = formatCurrency(cajaf.egresos.proveedores);
    document.getElementById('concilGastos').textContent = formatCurrency(cajaf.egresos.gastos);
    document.getElementById('concilTransfEgresos').textContent = formatCurrency(cajav.egresos.transferencias + cajav.egresos.pagosProveedores);
    document.getElementById('concilTotalFisica').textContent = formatCurrency(cajaf.total);
    document.getElementById('concilTotalVirtual').textContent = formatCurrency(cajav.movimientoHoy);
    document.getElementById('concilSaldoBanco').textContent = formatCurrency(cajav.saldoActual);
    document.getElementById('concilTotal').textContent = formatCurrency(resumen.caja.esperada);
    document.getElementById('concilVentasCredito').textContent = formatCurrency(resumen.ventas.credito);
}

// =====================================================
// FUNCIONES PARA MOSTRAR DETALLES EN MODAL
// =====================================================

// Stack para navegación de modales
let modalStack = [];

/**
 * Ver detalles de todas las ventas
 */
function verDetallesVentas() {
    if (!resumenActual || !resumenActual.ventas.lista.length) {
        mostrarModalVacio('Ventas del Día', 'No hay ventas registradas hoy');
        return;
    }

    const ventas = resumenActual.ventas.lista;
    const ventasCreditoIds = new Set(
        (resumenActual.creditos.otorgados || [])
            .filter(c => c.tipo === 'VENTA' && c.venta_id)
            .map(c => c.venta_id)
    );
    const ventasCredito = ventas.filter(v => ventasCreditoIds.has(v.id));
    const ventasEfectivo = ventas.filter(v => !ventasCreditoIds.has(v.id));

    const html = `
        <div style="margin-bottom: 30px;">
            <h4 style="margin-bottom: 15px; color: var(--accent-yellow);">
                <i class="fas fa-shopping-cart"></i> Resumen de Ventas del Día
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <div style="padding: 20px; background: #fffbf0; border-radius: 8px; cursor: pointer;" onclick="verDetalleVentasEfectivo()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Ventas en Efectivo</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--success-color);">${formatCurrency(resumenActual.ventas.efectivo)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${ventasEfectivo.length} venta(s)</div>
                </div>
                <div style="padding: 20px; background: #fff3cd; border-radius: 8px; cursor: pointer;" onclick="verDetalleVentasCredito()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Ventas a Crédito</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--warning-color);">${formatCurrency(resumenActual.ventas.credito)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${ventasCredito.length} venta(s)</div>
                </div>
                <div style="padding: 20px; background: #e8f5e9; border-radius: 8px;">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Ventas Totales</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--primary-color);">${formatCurrency(resumenActual.ventas.total)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${ventas.length} venta(s)</div>
                </div>
            </div>
        </div>
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>ID Venta</th>
                        <th>Cliente</th>
                        <th>Tipo</th>
                        <th>Total</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
                    ${ventas.map(venta => `
                        <tr>
                            <td>${formatTime(venta.fecha_hora_venta)}</td>
                            <td><strong>${venta.id_venta}</strong></td>
                            <td>${venta.cliente_id || 'Consumidor Final'}</td>
                            <td><span style="color: ${venta.tipo === 'FACTURA' ? '#3498db' : '#95a5a6'}; font-weight: 600;">${venta.tipo}</span></td>
                            <td>${formatCurrency(venta.total)}</td>
                            <td><span style="color: ${getEstadoColor(venta.estado)}; font-weight: 600;">${venta.estado}</span></td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    mostrarModal('Ventas del Día', html);
}

function verDetalleVentasEfectivo() {
    if (!resumenActual) return;

    const ventas = resumenActual.ventas.lista || [];
    const ventasCreditoIds = new Set(
        (resumenActual.creditos.otorgados || [])
            .filter(c => c.tipo === 'VENTA' && c.venta_id)
            .map(c => c.venta_id)
    );
    const ventasEfectivo = ventas.filter(v => !ventasCreditoIds.has(v.id));

    if (!ventasEfectivo.length) {
        mostrarModalVacio('Ventas en Efectivo', 'No hay ventas en efectivo registradas hoy', true);
        return;
    }

    const total = ventasEfectivo.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

    const html = `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>ID Venta</th>
                        <th>Tipo</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${ventasEfectivo.map(venta => `
                        <tr>
                            <td>${formatTime(venta.fecha_hora_venta)}</td>
                            <td><strong>${venta.id_venta}</strong></td>
                            <td>${venta.tipo}</td>
                            <td>${formatCurrency(venta.total)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #e8f5e9; border-radius: 8px; text-align: center;">
            <strong>Total Efectivo: ${formatCurrency(total)}</strong><br>
            <small>${ventasEfectivo.length} venta${ventasEfectivo.length !== 1 ? 's' : ''}</small>
        </div>
    `;

    mostrarModal('Ventas en Efectivo', html, true);
}

/**
 * Ver detalles de ventas a crédito
 */
function verDetalleVentasCredito() {
    if (!resumenActual) return;

    const creditosVenta = resumenActual.creditos.otorgados.filter(c => c.tipo === 'VENTA' && c.venta_id);

    if (!creditosVenta.length) {
        mostrarModalVacio('Ventas a Crédito', 'No hay ventas a crédito registradas hoy');
        return;
    }

    let html = `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Código</th>
                        <th>Deudor</th>
                        <th>Monto</th>
                        <th>Saldo Pendiente</th>
                        <th>Estado</th>
                    </tr>
                </thead>
                <tbody>
    `;

    creditosVenta.forEach(credito => {
        html += `
            <tr>
                <td><strong>${credito.codigo}</strong></td>
                <td>${credito.deudores?.nombre || 'N/A'}</td>
                <td>${formatCurrency(credito.monto)}</td>
                <td>${formatCurrency(credito.saldo_pendiente)}</td>
                <td><span style="color: ${getEstadoColor(credito.estado)}; font-weight: 600;">${credito.estado}</span></td>
            </tr>
        `;
    });

    const total = creditosVenta.reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px;">
            <strong>⚠️ Total a Crédito: ${formatCurrency(total)}</strong> 
            (${creditosVenta.length} crédito${creditosVenta.length !== 1 ? 's' : ''})
            <br><small>Este dinero NO está en caja</small>
        </div>
    `;

    mostrarModal('Ventas a Crédito', html, true);
}

/**
 * Ver detalles de ingresos
 */
function verDetallesIngresos() {
    if (!resumenActual) return;

    const { ingresos } = resumenActual;
    const transferenciasIngresos = resumenActual.transferencias.ingresos || [];
    const pagosCxC = ingresos.listaPagos || [];
    
    let html = `
        <div style="margin-bottom: 30px;">
            <h4 style="margin-bottom: 15px; color: var(--success-color);">
                <i class="fas fa-arrow-circle-down"></i> Resumen de Ingresos del Día
            </h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <div style="padding: 20px; background: #fffbf0; border-radius: 8px; cursor: pointer;" onclick="verDetallesVentas()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Ventas Totales</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--accent-yellow);">${formatCurrency(ingresos.ventas)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${resumenActual.ventas.cantidad} venta(s)</div>
                </div>
                <div style="padding: 20px; background: #e8f5e9; border-radius: 8px; cursor: pointer;" onclick="verDetallePagosCxC()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Pagos CxC</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--success-color);">${formatCurrency(ingresos.pagosCxC)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${pagosCxC.length} pago(s)</div>
                </div>
                <div style="padding: 20px; background: #d1fae5; border-radius: 8px; cursor: pointer;" onclick="verDetallesTransferencias()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Transferencias Recibidas</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--success-color);">${formatCurrency(ingresos.transferencias)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${transferenciasIngresos.length} movimiento(s)</div>
                </div>
            </div>
            <div style="margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 15px;">
                <div style="padding: 20px; background: #fff; border-radius: 8px; border: 1px solid var(--light-bg);">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Pagos CxC - Efectivo</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${formatCurrency(ingresos.detallePagosCxC.efectivo)}</div>
                </div>
                <div style="padding: 20px; background: #fff; border-radius: 8px; border: 1px solid var(--light-bg);">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Pagos CxC - Transferencia</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${formatCurrency(ingresos.detallePagosCxC.transferencia)}</div>
                </div>
                <div style="padding: 20px; background: #fff; border-radius: 8px; border: 1px solid var(--light-bg);">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Pagos CxC - Otros</div>
                    <div style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color);">${formatCurrency(ingresos.detallePagosCxC.otros)}</div>
                </div>
            </div>
        </div>
        <div style="padding: 20px; background: var(--success-color); color: white; border-radius: 8px; text-align: center;">
            <div style="font-size: 1rem; margin-bottom: 5px;">Total Ingresos del Día</div>
            <div style="font-size: 2.5rem; font-weight: bold;">${formatCurrency(ingresos.total)}</div>
        </div>
        <div style="margin-top: 20px; text-align: center; color: var(--text-light);">
            <small>Haz clic en cada tarjeta para ver el detalle</small>
        </div>
    `;

    mostrarModal('Detalles de Ingresos', html);
}

/**
 * Ver detalles de pagos CxC
 */
function verDetallePagosCxC() {
    if (!resumenActual || !resumenActual.ingresos.listaPagos.length) {
        mostrarModalVacio('Pagos de Cuentas por Cobrar', 'No hay pagos recibidos hoy');
        return;
    }

    const pagos = resumenActual.ingresos.listaPagos;
    let html = `
        <div class="table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Hora</th>
                        <th>Cuenta</th>
                        <th>Deudor</th>
                        <th>Monto</th>
                        <th>Forma Pago</th>
                    </tr>
                </thead>
                <tbody>
    `;

    pagos.forEach(pago => {
        html += `
            <tr>
                <td>${formatTime(pago.fecha_pago)}</td>
                <td><strong>${pago.cuentas_por_cobrar?.codigo || 'N/A'}</strong></td>
                <td>${pago.cuentas_por_cobrar?.deudores?.nombre || 'N/A'}</td>
                <td>${formatCurrency(pago.monto_pago)}</td>
                <td>${pago.forma_pago}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #e8f5e9; border-radius: 8px;">
            <strong>Total Pagos CxC: ${formatCurrency(resumenActual.ingresos.pagosCxC)}</strong> 
            (${pagos.length} pago${pagos.length !== 1 ? 's' : ''})
        </div>
    `;

    mostrarModal('Pagos de Cuentas por Cobrar', html, true);
}

/**
 * Ver otros ingresos
 */
function verDetalleOtrosIngresos() {
    mostrarModalVacio('Otros Ingresos', 'No hay otros ingresos registrados hoy', true);
}

/**
 * Ver detalles de egresos
 */
function verDetallesEgresos() {
    if (!resumenActual) return;

    const { egresos } = resumenActual;
    
    let html = `
        <div style="margin-bottom: 30px;">
            <h4 style="margin-bottom: 15px; color: var(--danger-color);">
                <i class="fas fa-arrow-circle-up"></i> Resumen de Egresos del Día
            </h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div style="padding: 20px; background: #fef2f2; border-radius: 8px; cursor: pointer;" onclick="verDetallePagosProveedores()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Pagos a Proveedores</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--danger-color);">${formatCurrency(egresos.proveedores)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${egresos.listaProveedores?.length || 0} pago(s)</div>
                </div>
                <div style="padding: 20px; background: #fff3cd; border-radius: 8px; cursor: pointer;" onclick="verDetalleGastos()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Gastos Varios</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--warning-color);">${formatCurrency(egresos.gastos)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${egresos.listaGastos?.length || 0} gasto(s)</div>
                </div>
            </div>
        </div>
        <div style="padding: 20px; background: var(--danger-color); color: white; border-radius: 8px; text-align: center;">
            <div style="font-size: 1rem; margin-bottom: 5px;">Total Egresos del Día</div>
            <div style="font-size: 2.5rem; font-weight: bold;">${formatCurrency(egresos.total)}</div>
        </div>
        <div style="margin-top: 20px; text-align: center; color: var(--text-light);">
            <small>Haz clic en cada tarjeta para ver el detalle</small>
        </div>
    `;

    mostrarModal('Detalles de Egresos', html);
}

/**
 * Ver pagos a proveedores
 */
function verDetallePagosProveedores() {
    if (!resumenActual || !resumenActual.egresos.listaProveedores || resumenActual.egresos.listaProveedores.length === 0) {
        mostrarModalVacio('Pagos a Proveedores', 'No hay pagos a proveedores registrados hoy', true);
        return;
    }

    const pagos = resumenActual.egresos.listaProveedores;
    
    let html = `
        <div class="lista-detalle">
            ${pagos.map(pago => {
                const fecha = new Date(pago.fecha_pago);
                const hora = fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="detalle-item">
                        <div class="detalle-header">
                            <span class="detalle-hora"><i class="fas fa-clock"></i> ${hora}</span>
                            <span class="detalle-monto">${formatCurrency(pago.monto_pago)}</span>
                        </div>
                        <div class="detalle-info">
                            <div><strong>Pago a Proveedor</strong></div>
                            <div style="font-size: 0.9rem; color: var(--text-light);">
                                ${pago.metodo_pago} | ${pago.tipo_pago}
                            </div>
                            ${pago.referencia_pago ? `<div style="font-size: 0.85rem; color: var(--text-light);">Ref: ${pago.referencia_pago}</div>` : ''}
                            ${pago.notas ? `<div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${pago.notas}</div>` : ''}
                            <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">Saldo nuevo: ${formatCurrency(pago.saldo_nuevo)}</div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border-radius: 8px; text-align: center;">
            <div style="color: var(--text-light); font-size: 0.9rem;">Total Pagado a Proveedores</div>
            <div style="font-size: 1.8rem; font-weight: bold; color: var(--danger-color);">${formatCurrency(resumenActual.egresos.proveedores)}</div>
        </div>
    `;
    
    mostrarModal('Pagos a Proveedores', html, true);
}

/**
 * Ver gastos
 */
function verDetalleGastos() {
    if (!resumenActual || !resumenActual.egresos.listaGastos || resumenActual.egresos.listaGastos.length === 0) {
        mostrarModalVacio('Gastos del Día', 'No hay gastos registrados hoy', true);
        return;
    }

    const gastos = resumenActual.egresos.listaGastos;
    
    let html = `
        <div class="lista-detalle">
            ${gastos.map(gasto => {
                const fecha = new Date(gasto.fechayhora);
                const hora = fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="detalle-item">
                        <div class="detalle-header">
                            <span class="detalle-hora"><i class="fas fa-clock"></i> ${hora}</span>
                            <span class="detalle-monto">${formatCurrency(gasto.monto)}</span>
                        </div>
                        <div class="detalle-info">
                            <div><strong>${gasto.motivo}</strong></div>
                            ${gasto.usuario ? `<div style="font-size: 0.85rem; color: var(--text-light);">Usuario: ${gasto.usuario}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border-radius: 8px; text-align: center;">
            <div style="color: var(--text-light); font-size: 0.9rem;">Total en Gastos</div>
            <div style="font-size: 1.8rem; font-weight: bold; color: var(--warning-color);">${formatCurrency(resumenActual.egresos.gastos)}</div>
        </div>
    `;
    
    mostrarModal('Gastos del Día', html, true);
}

/**
 * Ver detalles de transferencias
 */
function verDetallesTransferencias() {
    if (!resumenActual || !resumenActual.transferencias || (!resumenActual.transferencias.ingresos.length && !resumenActual.transferencias.egresos.length)) {
        mostrarModalVacio('Transferencias', 'No hay transferencias registradas hoy');
        return;
    }

    const { transferencias } = resumenActual;
    
    let html = `
        <div style="margin-bottom: 30px;">
            <h4 style="margin-bottom: 15px; color: var(--primary-color);">
                <i class="fas fa-exchange-alt"></i> Resumen de Transferencias del Día
            </h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div style="padding: 20px; background: #d1fae5; border-radius: 8px; cursor: pointer;" onclick="verDetalleTransferenciasIngresos()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Ingresos</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--success-color);">+${formatCurrency(transferencias.totalIngresos)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${transferencias.ingresos.length} ingreso(s)</div>
                </div>
                <div style="padding: 20px; background: #fef2f2; border-radius: 8px; cursor: pointer;" onclick="verDetalleTransferenciasEgresos()">
                    <div style="font-size: 0.9rem; color: var(--text-light); margin-bottom: 5px;">Egresos</div>
                    <div style="font-size: 1.8rem; font-weight: bold; color: var(--danger-color);">-${formatCurrency(transferencias.totalEgresos)}</div>
                    <div style="font-size: 0.85rem; color: var(--text-light); margin-top: 5px;">${transferencias.egresos.length} egreso(s)</div>
                </div>
            </div>
        </div>
        <div style="padding: 20px; background: ${transferencias.neto >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}; color: white; border-radius: 8px; text-align: center;">
            <div style="font-size: 1rem; margin-bottom: 5px;">Neto de Transferencias</div>
            <div style="font-size: 2.5rem; font-weight: bold;">${transferencias.neto >= 0 ? '+' : ''}${formatCurrency(transferencias.neto)}</div>
        </div>
        <div style="margin-top: 20px; text-align: center; color: var(--text-light);">
            <small>Haz clic en cada tarjeta para ver el detalle</small>
        </div>
    `;

    mostrarModal('Detalles de Transferencias', html);
}

/**
 * Ver transferencias - ingresos
 */
function verDetalleTransferenciasIngresos() {
    if (!resumenActual || !resumenActual.transferencias.ingresos.length) {
        mostrarModalVacio('Transferencias - Ingresos', 'No hay transferencias de ingreso registradas hoy', true);
        return;
    }

    const ingresos = resumenActual.transferencias.ingresos;
    
    let html = `
        <div class="lista-detalle">
            ${ingresos.map(trans => {
                const fecha = new Date(trans.fechahora);
                const hora = fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="detalle-item">
                        <div class="detalle-header">
                            <span class="detalle-hora"><i class="fas fa-clock"></i> ${hora}</span>
                            <span class="detalle-monto" style="color: var(--success-color);">+${formatCurrency(trans.monto)}</span>
                        </div>
                        <div class="detalle-info">
                            <div><strong>${trans.motivo}</strong></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #d1fae5; border-radius: 8px; text-align: center;">
            <div style="color: var(--text-light); font-size: 0.9rem;">Total Ingresos por Transferencias</div>
            <div style="font-size: 1.8rem; font-weight: bold; color: var(--success-color);">+${formatCurrency(resumenActual.transferencias.totalIngresos)}</div>
        </div>
    `;
    
    mostrarModal('Transferencias - Ingresos', html, true);
}

/**
 * Ver transferencias - egresos
 */
function verDetalleTransferenciasEgresos() {
    if (!resumenActual || !resumenActual.transferencias.egresos.length) {
        mostrarModalVacio('Transferencias - Egresos', 'No hay transferencias de egreso registradas hoy', true);
        return;
    }

    const egresos = resumenActual.transferencias.egresos;
    
    let html = `
        <div class="lista-detalle">
            ${egresos.map(trans => {
                const fecha = new Date(trans.fechahora);
                const hora = fecha.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' });
                
                return `
                    <div class="detalle-item">
                        <div class="detalle-header">
                            <span class="detalle-hora"><i class="fas fa-clock"></i> ${hora}</span>
                            <span class="detalle-monto" style="color: var(--danger-color);">-${formatCurrency(trans.monto)}</span>
                        </div>
                        <div class="detalle-info">
                            <div><strong>${trans.motivo}</strong></div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border-radius: 8px; text-align: center;">
            <div style="color: var(--text-light); font-size: 0.9rem;">Total Egresos por Transferencias</div>
            <div style="font-size: 1.8rem; font-weight: bold; color: var(--danger-color);">-${formatCurrency(resumenActual.transferencias.totalEgresos)}</div>
        </div>
    `;
    
    mostrarModal('Transferencias - Egresos', html, true);
}

/**
 * Mostrar modal con contenido
 */
function mostrarModal(titulo, contenido, esSubmodal = false) {
    // Si es un submodal, guardar el estado actual en el stack
    if (esSubmodal && document.getElementById('detalleModal').style.display === 'flex') {
        const estadoActual = {
            titulo: document.getElementById('modalTitle').textContent,
            contenido: document.getElementById('modalBody').innerHTML
        };
        modalStack.push(estadoActual);
    }
    
    document.getElementById('modalTitle').textContent = titulo;
    document.getElementById('modalBody').innerHTML = contenido;
    document.getElementById('detalleModal').style.display = 'flex';
    
    // Mostrar u ocultar botón de regresar
    const btnBack = document.getElementById('modalBack');
    if (modalStack.length > 0) {
        btnBack.style.display = 'flex';
    } else {
        btnBack.style.display = 'none';
    }
    
    // Deshabilitar scroll del body
    document.body.classList.add('modal-open');
}

/**
 * Mostrar modal vacío con mensaje
 */
function mostrarModalVacio(titulo, mensaje, esSubmodal = false) {
    const html = `
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-inbox fa-3x" style="color: var(--border-color); margin-bottom: 20px;"></i>
            <p style="color: var(--text-light); font-size: 1.1rem;">${mensaje}</p>
        </div>
    `;
    mostrarModal(titulo, html, esSubmodal);
}

/**
 * Cerrar modal
 */
function cerrarModal() {
    document.getElementById('detalleModal').style.display = 'none';
    // Limpiar el stack de modales
    modalStack = [];
    // Habilitar scroll del body
    document.body.classList.remove('modal-open');
}

/**
 * Regresar al modal anterior
 */
function regresarModal() {
    if (modalStack.length === 0) return;
    
    // Obtener el modal anterior del stack
    const modalAnterior = modalStack.pop();
    
    // Restaurar el contenido
    document.getElementById('modalTitle').textContent = modalAnterior.titulo;
    document.getElementById('modalBody').innerHTML = modalAnterior.contenido;
    
    // Ocultar botón de regresar si no hay más modales en el stack
    const btnBack = document.getElementById('modalBack');
    if (modalStack.length === 0) {
        btnBack.style.display = 'none';
    }
}

// Cerrar modal al hacer clic fuera de él
document.addEventListener('click', (e) => {
    const modal = document.getElementById('detalleModal');
    if (e.target === modal) {
        cerrarModal();
    }
});

/**
 * Muestra alertas basadas en el resumen
 */
function mostrarAlertas(resumen) {
    const alertas = verificarDiscrepancias(resumen);
    const container = document.getElementById('alertsContainer');

    if (alertas.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    alertas.forEach(alerta => {
        html += `
            <div class="alert alert-${alerta.tipo}">
                <i class="fas ${alerta.icon}"></i>
                <span>${alerta.mensaje}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

/**
 * Muestra u oculta el overlay de carga
 */
function showLoading(show) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.style.display = show ? 'flex' : 'none';
}

/**
 * Muestra un mensaje de error
 */
function mostrarError(mensaje) {
    const container = document.getElementById('alertsContainer');
    container.innerHTML = `
        <div class="alert" style="background: #ffe6e6; color: #e74c3c; border-left-color: #e74c3c;">
            <i class="fas fa-exclamation-circle"></i>
            <span>${mensaje}</span>
        </div>
    `;
}

/**
 * Obtiene el color según el estado
 */
function getEstadoColor(estado) {
    const colores = {
        'COMPLETADO': '#27ae60',
        'AUTORIZADO': '#3498db',
        'PENDIENTE': '#f39c12',
        'PAGADO': '#27ae60',
        'PARCIAL': '#f39c12',
        'RECHAZADO': '#e74c3c',
        'VENCIDO': '#e74c3c',
        'CANCELADO': '#95a5a6'
    };
    return colores[estado] || '#7f8c8d';
}

/**
 * Inicia el auto-refresh cada 5 minutos
 */
function startAutoRefresh() {
    // Limpiar interval existente
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    // Refrescar cada 5 minutos (300000 ms)
    autoRefreshInterval = setInterval(async () => {
        console.log('Auto-refresh del dashboard...');
        await cargarDatosDashboard();
    }, 300000);
}

/**
 * Detiene el auto-refresh
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Limpiar al descargar la página
window.addEventListener('beforeunload', () => {
    stopAutoRefresh();
});
