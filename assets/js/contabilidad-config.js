// =====================================================
// CONTABILIDAD - CONFIGURACIÓN Y UTILIDADES
// =====================================================

/**
 * Obtiene la fecha de inicio del día actual (00:00:00) ajustada para Ecuador
 * Las fechas en la BD están en UTC, pero queremos filtrar por día local de Ecuador (UTC-5)
 */
function getStartOfDay(date = new Date()) {
    const d = new Date(date);
    // Extraer componentes locales (browser)
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    // El inicio del día 2024-01-12 en Ecuador (UTC-5) 
    // es 2024-01-12T05:00:00.000Z en UTC
    return `${year}-${month}-${day}T05:00:00.000Z`;
}

/**
 * Obtiene la fecha de fin del día actual (23:59:59) ajustada para Ecuador
 * Las fechas en la BD están en UTC, pero queremos filtrar por día local de Ecuador (UTC-5)
 */
function getEndOfDay(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    
    // Crear objeto para el día siguiente en local
    const nextDay = new Date(year, month, day + 1);
    const nextYear = nextDay.getFullYear();
    const nextMonth = String(nextDay.getMonth() + 1).padStart(2, '0');
    const nextDayNum = String(nextDay.getDate()).padStart(2, '0');
    
    // El fin del día 2024-01-12 en Ecuador (UTC-5) 
    // es 2024-01-13T04:59:59.999Z en UTC
    return `${nextYear}-${nextMonth}-${nextDayNum}T04:59:59.999Z`;
}

/**
 * Formatea un número como moneda USD
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('es-EC', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount || 0);
}

/**
 * Formatea una fecha/hora para visualización
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('es-EC', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formatea solo la hora
 */
function formatTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-EC', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formatea solo la fecha
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-EC', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function toISODateString(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// =====================================================
// QUERIES A SUPABASE
// =====================================================

/**
 * Obtiene todas las ventas del día actual
 */
async function getVentasDelDia(targetDate = new Date()) {
    const client = getSupabaseClient();
    const startOfDay = getStartOfDay(targetDate);
    const endOfDay = getEndOfDay(targetDate);

    try {
        const { data, error } = await client
            .from('ferre_ventas')
            .select('*')
            .gte('fecha_hora_venta', startOfDay)
            .lte('fecha_hora_venta', endOfDay)
            .in('estado', ['COMPLETADO', 'AUTORIZADO'])
            .order('fecha_hora_venta', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error al obtener ventas del día:', error);
        return [];
    }
}

/**
 * Obtiene los créditos (cuentas por cobrar) otorgados hoy
 */
async function getCreditosOtorgadosHoy(targetDate = new Date()) {
    const client = getSupabaseClient();
    const startOfDay = getStartOfDay(targetDate);
    const endOfDay = getEndOfDay(targetDate);

    try {
        const { data, error } = await client
            .from('ferre_cuentas_por_cobrar')
            .select(`
                *,
                ferre_deudores (
                    cedula_ruc,
                    nombre
                )
            `)
            .gte('fecha_otorgada', startOfDay)
            .lte('fecha_otorgada', endOfDay)
            .order('fecha_otorgada', { ascending: false });

        if (error) throw error;
        return await enriquecerCuentasConDeudores(client, data || []);
    } catch (error) {
        console.error('Error al obtener créditos otorgados:', error);
        return [];
    }
}

/**
 * Obtiene los pagos recibidos de cuentas por cobrar hoy
 */
async function getPagosRecibidosHoy(targetDate = new Date()) {
    const client = getSupabaseClient();
    const startOfDay = getStartOfDay(targetDate);
    const endOfDay = getEndOfDay(targetDate);

    try {
        const { data, error } = await client
            .from('ferre_pagos_cuentas_por_cobrar')
            .select(`
                *,
                ferre_cuentas_por_cobrar (
                    id,
                    codigo,
                    motivo,
                    deudor_id,
                    ferre_deudores (
                        nombre,
                        cedula_ruc
                    )
                )
            `)
            .gte('fecha_pago', startOfDay)
            .lte('fecha_pago', endOfDay)
            .order('fecha_pago', { ascending: false });

        if (error) throw error;
        const pagos = data || [];
        const cuentas = await enriquecerCuentasConDeudores(
            client,
            pagos.map(pago => pago.ferre_cuentas_por_cobrar || pago.cuentas_por_cobrar).filter(Boolean)
        );
        const cuentasPorId = new Map(cuentas.map(cuenta => [cuenta.id, cuenta]));

        return pagos.map(pago => {
            const cuentaOriginal = pago.ferre_cuentas_por_cobrar || pago.cuentas_por_cobrar || null;
            const cuenta = cuentasPorId.get(cuentaOriginal?.id) || cuentaOriginal;

            return {
                ...pago,
                cuentas_por_cobrar: cuenta,
                ferre_cuentas_por_cobrar: cuenta
            };
        });
    } catch (error) {
        console.error('Error al obtener pagos recibidos:', error);
        return [];
    }
}

async function enriquecerCuentasConDeudores(client, cuentas) {
    if (!Array.isArray(cuentas) || cuentas.length === 0) {
        return [];
    }

    const deudorIds = [...new Set(cuentas.map(cuenta => cuenta.deudor_id).filter(Boolean))];
    const deudoresPorId = new Map();

    if (deudorIds.length > 0) {
        const { data, error } = await client
            .from('ferre_deudores')
            .select('id, cedula_ruc, nombre')
            .in('id', deudorIds);

        if (!error) {
            (data || []).forEach(deudor => deudoresPorId.set(deudor.id, deudor));
        } else {
            console.warn('No se pudo resolver deudores por id:', error);
        }
    }

    return cuentas.map(cuenta => {
        const deudor = cuenta.ferre_deudores || cuenta.deudores || cuenta.deudor || deudoresPorId.get(cuenta.deudor_id) || null;

        return {
            ...cuenta,
            deudor,
            deudores: deudor,
            ferre_deudores: deudor,
            deudor_nombre: deudor?.nombre || cuenta.deudor_nombre || null
        };
    });
}

/**
 * Obtiene las facturas de proveedores pagadas hoy
 * Lee de la tabla pagos_proveedores
 */
async function getPagosProveedoresHoy(targetDate = new Date()) {
    try {
        const supabase = getSupabaseClient();
        const startOfDay = getStartOfDay(targetDate);
        const endOfDay = getEndOfDay(targetDate);

        console.log('📅 Buscando pagos a proveedores:', { startOfDay, endOfDay });

        const { data, error } = await supabase
            .from('ferre_pagos_proveedores')
            .select('*')
            .gte('fecha_pago', startOfDay)
            .lte('fecha_pago', endOfDay)
            .order('fecha_pago', { ascending: false });

        if (error) {
            console.error('❌ Error al obtener pagos a proveedores:', error);
            return [];
        }

        const pagosEnriquecidos = await enriquecerPagosProveedoresConProveedor(supabase, data || []);

        console.log('✅ Pagos a proveedores encontrados:', pagosEnriquecidos.length, pagosEnriquecidos);
        return pagosEnriquecidos;
    } catch (error) {
        console.error('Error en getPagosProveedoresHoy:', error);
        return [];
    }
}

async function enriquecerPagosProveedoresConProveedor(supabase, pagos) {
    if (!Array.isArray(pagos) || pagos.length === 0) {
        return [];
    }

    const facturaIds = [...new Set(
        pagos
            .map(pago => pago.factura_id)
            .filter(Boolean)
    )];

    if (facturaIds.length === 0) {
        return pagos;
    }

    const facturas = await getFacturasProveedorPorIds(supabase, facturaIds);
    const proveedorIds = [...new Set(
        facturas
            .map(getProveedorIdDesdeFactura)
            .filter(Boolean)
    )];
    const proveedorCodigos = [...new Set(
        facturas
            .map(getProveedorCodigoDesdeFactura)
            .filter(Boolean)
    )];
    const proveedores = await getProveedoresPorIdentificadores(supabase, proveedorIds, proveedorCodigos);
    const facturasPorId = new Map(facturas.map(factura => [factura.id, factura]));

    return pagos.map(pago => {
        const factura = facturasPorId.get(pago.factura_id) || pago.factura || pago.ferre_facturas_proveedores || null;
        const proveedorId = getProveedorIdDesdeFactura(factura);
        const proveedorCodigo = getProveedorCodigoDesdeFactura(factura);
        const proveedor = proveedores.byId.get(proveedorId) || proveedores.byCodigo.get(proveedorCodigo) || null;

        return {
            ...pago,
            factura,
            proveedor,
            proveedor_nombre: getProveedorNombreDesdeDatos(proveedor, factura, pago)
        };
    });
}

async function getFacturasProveedorPorIds(supabase, facturaIds) {
    const tablasFactura = [
        'ferre_facturas_proveedores',
        'ferre_facturas_compra',
        'ferre_compras',
        'ferre_cuentas_por_pagar'
    ];

    for (const tabla of tablasFactura) {
        const { data, error } = await supabase
            .from(tabla)
            .select('*')
            .in('id', facturaIds);

        if (!error) {
            return data || [];
        }

        console.warn(`No se pudo consultar ${tabla} para resolver proveedores:`, error);
    }

    return [];
}

async function getProveedoresPorIdentificadores(supabase, proveedorIds, proveedorCodigos) {
    const byId = new Map();
    const byCodigo = new Map();

    if (proveedorIds.length > 0) {
        const { data, error } = await supabase
            .from('ferre_proveedores')
            .select('*')
            .in('id', proveedorIds);

        if (!error) {
            (data || []).forEach(proveedor => {
                byId.set(proveedor.id, proveedor);
                if (proveedor.codigo) byCodigo.set(proveedor.codigo, proveedor);
            });
        } else {
            console.warn('No se pudo resolver proveedores por id:', error);
        }
    }

    if (proveedorCodigos.length > 0) {
        const pendientes = proveedorCodigos.filter(codigo => !byCodigo.has(codigo));
        if (pendientes.length > 0) {
            const { data, error } = await supabase
                .from('ferre_proveedores')
                .select('*')
                .in('codigo', pendientes);

            if (!error) {
                (data || []).forEach(proveedor => {
                    byId.set(proveedor.id, proveedor);
                    if (proveedor.codigo) byCodigo.set(proveedor.codigo, proveedor);
                });
            } else {
                console.warn('No se pudo resolver proveedores por codigo:', error);
            }
        }
    }

    return { byId, byCodigo };
}

function getProveedorIdDesdeFactura(factura) {
    return factura?.proveedor_id || factura?.id_proveedor || factura?.proveedor_uuid || factura?.supplier_id || null;
}

function getProveedorCodigoDesdeFactura(factura) {
    return factura?.proveedor_codigo || factura?.codigo_proveedor || factura?.supplier_code || null;
}

function getProveedorNombreDesdeDatos(proveedor, factura, pago) {
    const candidatos = [
        proveedor?.empresa,
        proveedor?.vendedor,
        factura?.proveedor_empresa,
        factura?.empresa_proveedor,
        factura?.nombre_proveedor,
        factura?.proveedor_nombre,
        pago?.proveedor_nombre,
        pago?.nombre_proveedor
    ];

    return candidatos.find(valor => typeof valor === 'string' && valor.trim())?.trim() || null;
}

/**
 * Obtiene los gastos registrados hoy
 * Lee de la tabla gastos
 */
async function getGastosHoy(targetDate = new Date()) {
    try {
        const supabase = getSupabaseClient();
        const startOfDay = getStartOfDay(targetDate);
        const endOfDay = getEndOfDay(targetDate);

        console.log('📅 Buscando gastos del día:', { startOfDay, endOfDay });
        
        // Verificar usuario autenticado
        const { data: { user } } = await supabase.auth.getUser();
        console.log('👤 Usuario autenticado:', user?.email);

        // DEBUG: Primero ver TODOS los gastos sin filtro
        const { data: todosGastos, error: errorTodos } = await supabase
            .from('ferre_gastos')
            .select('*')
            .order('fechayhora', { ascending: false })
            .limit(10);
        
        if (errorTodos) {
            console.error('❌ Error al obtener todos los gastos (problema de RLS?):', errorTodos);
        } else {
            console.log('🔍 DEBUG - Últimos 10 gastos en la tabla:', todosGastos);
        }

        // Ahora buscar con el rango de fechas ajustado a Ecuador
        let { data, error } = await supabase
            .from('ferre_gastos')
            .select('*')
            .gte('fechayhora', startOfDay)
            .lte('fechayhora', endOfDay)
            .order('fechayhora', { ascending: false });

        if (error) {
            console.error('❌ Error al obtener gastos:', error);
            console.error('❌ Detalles del error:', JSON.stringify(error));
            return [];
        }

        console.log('✅ Gastos encontrados con rango Ecuador:', data?.length || 0, data);
        return data || [];

    } catch (error) {
        console.error('Error en getGastosHoy:', error);
        return [];
    }
}

/**
 * Obtiene las transferencias registradas hoy
 * Lee de la tabla transferencias y separa por tipo (ingreso/egreso)
 */
async function getTransferenciasHoy(targetDate = new Date()) {
    try {
        const supabase = getSupabaseClient();
        const startOfDay = getStartOfDay(targetDate);
        const endOfDay = getEndOfDay(targetDate);

        console.log('📅 Buscando transferencias del día:', { startOfDay, endOfDay });

        const { data, error } = await supabase
            .from('ferre_transferencias')
            .select('*')
            .gte('fechahora', startOfDay)
            .lte('fechahora', endOfDay)
            .order('fechahora', { ascending: false });

        if (error) {
            console.error('❌ Error al obtener transferencias:', error);
            return {
                ingresos: [],
                egresos: [],
                totalIngresos: 0,
                totalEgresos: 0,
                neto: 0
            };
        }

        const transferencias = data || [];
        
        console.log('✅ Transferencias encontradas:', transferencias.length, transferencias);
        
        // Separar por tipo
        const ingresos = transferencias.filter(t => t.caso === 'ingreso');
        const egresos = transferencias.filter(t => t.caso === 'egreso');

        // Calcular totales
        const totalIngresos = ingresos.reduce((sum, t) => sum + parseFloat(t.monto || 0), 0);
        const totalEgresos = egresos.reduce((sum, t) => sum + parseFloat(t.monto || 0), 0);
        const neto = totalIngresos - totalEgresos;

        console.log('💰 Resumen transferencias:', { 
            ingresos: ingresos.length, 
            egresos: egresos.length, 
            totalIngresos, 
            totalEgresos, 
            neto 
        });

        return {
            ingresos,
            egresos,
            totalIngresos,
            totalEgresos,
            neto,
            todas: transferencias
        };
    } catch (error) {
        console.error('Error en getTransferenciasHoy:', error);
        return {
            ingresos: [],
            egresos: [],
            totalIngresos: 0,
            totalEgresos: 0,
            neto: 0
        };
    }
}

/**
 * Obtiene el saldo actual de caja virtual (tabla saldo_actual)
 */
async function getSaldoActual() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('ferre_saldo_actual')
            .select('*')
            .eq('id', 1)
            .maybeSingle();

        if (error) {
            console.error('❌ Error al obtener saldo_actual:', error);
            return null;
        }

        return data || null;
    } catch (error) {
        console.error('Error en getSaldoActual:', error);
        return null;
    }
}

/**
 * Detecta créditos otorgados y pagados el mismo día (desfase a favor)
 */
async function detectarCreditosPagadosMismoDia(creditos, pagos) {
    const creditosPagadosHoy = [];

    for (const credito of creditos) {
        // Verificar si hay pagos del mismo crédito en el día
        const pagosMismoDia = pagos.filter(pago => 
            pago.cuentas_por_cobrar?.id === credito.id
        );

        if (pagosMismoDia.length > 0) {
            const totalPagado = pagosMismoDia.reduce((sum, p) => sum + parseFloat(p.monto_pago), 0);
            creditosPagadosHoy.push({
                credito: credito,
                pagos: pagosMismoDia,
                totalPagado: totalPagado
            });
        }
    }

    return creditosPagadosHoy;
}

/**
 * Calcula el resumen financiero del día
 */
async function calcularResumenDiario(fecha = new Date()) {
    try {
        let targetDate;
        if (fecha instanceof Date) {
            targetDate = new Date(fecha.getTime());
        } else if (typeof fecha === 'string' && fecha.includes('-')) {
            // Manejar strings YYYY-MM-DD para que siempre sean la fecha esperada en hora local
            const parts = fecha.split('T')[0].split('-');
            if (parts.length === 3) {
                targetDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            } else {
                targetDate = new Date(fecha);
            }
        } else {
            targetDate = new Date(fecha);
        }

        if (Number.isNaN(targetDate.getTime())) {
            throw new Error('Fecha inválida para el resumen diario');
        }

        const fechaISO = toISODateString(targetDate);
        console.log('🔄 Iniciando cálculo de resumen diario...', { fechaISO, original: fecha, targetDate: targetDate.toString() });
        
        // Obtener datos
        const ventas = await getVentasDelDia(targetDate);
        const creditos = await getCreditosOtorgadosHoy(targetDate);
        const pagos = await getPagosRecibidosHoy(targetDate);
        const pagosProveedores = await getPagosProveedoresHoy(targetDate);
        const gastos = await getGastosHoy(targetDate);
        const transferencias = await getTransferenciasHoy(targetDate);
        const saldoActual = await getSaldoActual();
        const cajaInicial = await getCajaInicialPorFecha(fechaISO);

        console.log('📊 Datos obtenidos:', {
            ventas: ventas.length,
            creditos: creditos.length,
            pagos: pagos.length,
            pagosProveedores: pagosProveedores.length,
            gastos: gastos.length,
            transferencias: transferencias.todas?.length || 0,
            fecha: fechaISO
        });

        // Calcular ventas
        const totalVentas = ventas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
        const gananciaVentas = ventas.reduce((sum, v) => sum + parseFloat(v.ganancia || 0), 0);
        
        // Separar ventas por tipo de pago y crédito
        const ventasIdCredito = creditos
            .filter(c => c.tipo === 'VENTA' && c.venta_id)
            .map(c => c.venta_id);
        
        const ventasCredito = ventas.filter(v => ventasIdCredito.includes(v.id));
        const ventasNoCredito = ventas.filter(v => !ventasIdCredito.includes(v.id));

        // De las no crédito, separar Efectivo vs Transferencia
        // Consideramos MIXTO como efectivo para el cuadre físico, 
        // ya que la parte transferencia se registra por separado en ferre_transferencias
        const ventasEfectivo = ventasNoCredito.filter(v => 
            (v.tipo_pago || '').toUpperCase() === 'EFECTIVO' || 
            (v.tipo_pago || '').toUpperCase() === 'MIXTO' || 
            !(v.tipo_pago)
        );
        const ventasTransferencia = ventasNoCredito.filter(v => 
            (v.tipo_pago || '').toUpperCase() === 'TRANSFERENCIA'
        );

        const totalVentasCredito = ventasCredito.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
        const totalVentasEfectivo = ventasEfectivo.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
        const totalVentasTransferencia = ventasTransferencia.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

        // Calcular ingresos
        const totalCreditosOtorgados = creditos.reduce((sum, c) => sum + parseFloat(c.monto || 0), 0);

        const totalPagosCxC = pagos.reduce((sum, p) => sum + parseFloat(p.monto_pago || 0), 0);
        console.log('💰 Pagos CxC recibidos:', pagos.map(p => ({ id: p.id, monto: p.monto_pago, forma_pago: p.forma_pago, metodo_pago: p.metodo_pago })));
        const pagosCxCTransferencia = pagos
            .filter(p => ['TRANSFERENCIA', 'DEPOSITO', 'DEPÓSITO', 'TARJETA', 'CHEQUE'].includes((p.forma_pago || p.metodo_pago || '').toUpperCase()))
            .reduce((sum, p) => sum + parseFloat(p.monto_pago || 0), 0);
        // Pagos CxC en efectivo: forma_pago EFECTIVO, o sin forma_pago definida (asumimos efectivo)
        const pagosCxCEfectivo = totalPagosCxC - pagosCxCTransferencia;
        const pagosCxCOtros = 0;

        const totalPagosProveedores = pagosProveedores.reduce((sum, p) => sum + parseFloat(p.monto_pago || 0), 0);
        const pagosProveedoresEfectivo = pagosProveedores
            .filter(p => (p.metodo_pago || '').toUpperCase() === 'EFECTIVO')
            .reduce((sum, p) => sum + parseFloat(p.monto_pago || 0), 0);
        const pagosProveedoresTransferencia = pagosProveedores
            .filter(p => (p.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA')
            .reduce((sum, p) => sum + parseFloat(p.monto_pago || 0), 0);
        const pagosProveedoresOtros = totalPagosProveedores - pagosProveedoresEfectivo - pagosProveedoresTransferencia;

        const totalGastos = gastos.reduce((sum, g) => sum + parseFloat(g.monto || 0), 0);

        // Filtrar transferencias manuales (que no son de ventas ni de proveedores)
        const transferenciasIngresoManuales = transferencias.ingresos.filter(t => 
            !t.id_venta && !(t.motivo || '').toLowerCase().includes('venta pos') && !(t.motivo || '').toLowerCase().includes('pago a')
        );
        const totalTransferenciasIngresoManuales = transferenciasIngresoManuales.reduce((sum, t) => sum + parseFloat(t.monto || 0), 0);

        const transferenciasEgresoManuales = transferencias.egresos.filter(t => 
            t.fotografia !== 'https://urlnodisponible.com' && !(t.motivo || '').toLowerCase().includes('pago a')
        );
        const totalTransferenciasEgresoManuales = transferenciasEgresoManuales.reduce((sum, t) => sum + parseFloat(t.monto || 0), 0);

        const otrosIngresos = 0; // TODO: Implementar cuando exista tabla de otros ingresos
        
        // Ingresos Totales = Ventas pagadas + CxC anotadas del día + Pagos CxC + Otros
        // No sumamos transferencias porque ya están incluidas en las ventas o pagos CxC
        const totalIngresos = totalVentasEfectivo + totalVentasTransferencia + totalCreditosOtorgados + totalPagosCxC + otrosIngresos;
        const totalIngresosMovimientos = ventasEfectivo.length + ventasTransferencia.length + creditos.length + pagos.length;

        // Egresos Totales = Pagos a Proveedores + Gastos
        // No sumamos transferencias porque ya están incluidas en pagos a proveedores o gastos
        const totalEgresosGlobal = totalPagosProveedores + totalGastos;
        const totalEgresosMovimientos = pagosProveedores.length + gastos.length;

        const cajaFisicaIngresos = {
            ventas: totalVentasEfectivo,
            pagosCxC: pagosCxCEfectivo,
            otros: 0
        };
        const cajaFisicaEgresos = {
            proveedores: pagosProveedoresEfectivo,
            gastos: totalGastos,
            // Si das efectivo a cambio de una transferencia, es una salida de efectivo (egreso físico)
            transferenciasManuales: totalTransferenciasIngresoManuales 
        };
        const cajaFisicaTotal = cajaFisicaIngresos.ventas + cajaFisicaIngresos.pagosCxC + cajaFisicaIngresos.otros
            - cajaFisicaEgresos.proveedores - cajaFisicaEgresos.gastos - cajaFisicaEgresos.transferenciasManuales;

        const cajaVirtualIngresos = {
            // transferencias.totalIngresos ya incluye las ventas por transferencia y posiblemente pagos CxC si se registran ahí
            // Para evitar duplicar, solo sumamos las transferencias totales (que es el reflejo real del banco)
            // Si hay pagos CxC por transferencia que NO están en ferre_transferencias, habría que sumarlos, 
            // pero asumimos que todo movimiento bancario está en ferre_transferencias.
            transferencias: transferencias.totalIngresos,
            pagosCxC: 0 // Se asume incluido en transferencias si fue por banco, o se ajusta si es necesario
        };
        const cajaVirtualEgresos = {
            // transferencias.totalEgresos ya incluye los pagos a proveedores (los de urlnodisponible)
            transferencias: transferencias.totalEgresos,
            pagosProveedores: 0 // Ya incluido en transferencias.totalEgresos
        };
        const cajaVirtualMovimiento = cajaVirtualIngresos.transferencias - cajaVirtualEgresos.transferencias;
        const saldoBanco = saldoActual?.monto_total ? parseFloat(saldoActual.monto_total) : 0;
        const saldoBancoFecha = saldoActual?.ultima_actualizacion || null;
        const cajaInicialMonto = cajaInicial ? parseFloat(cajaInicial.monto_inicial || 0) : 0;

        // Caja física final esperada = caja inicial + movimiento físico neto del día.
        // Las ventas a crédito ya están excluidas del movimiento físico, por eso no se restan aquí.
        const cajaEsperada = cajaInicialMonto + cajaFisicaTotal;

        // Detectar créditos pagados el mismo día
        const creditosPagadosHoy = await detectarCreditosPagadosMismoDia(creditos, pagos);

        const resumen = {
            periodo: {
                fecha: fechaISO,
                inicio: getStartOfDay(targetDate),
                fin: getEndOfDay(targetDate)
            },
            ventas: {
                total: totalVentas,
                efectivo: totalVentasEfectivo,
                transferencia: totalVentasTransferencia,
                credito: totalVentasCredito,
                cantidad: ventas.length,
                ganancia: gananciaVentas,
                lista: ventas
            },
            creditos: {
                otorgados: creditos,
                cantidad: creditos.length,
                total: totalCreditosOtorgados,
                pagadosMismoDia: creditosPagadosHoy
            },
            ingresos: {
                total: totalIngresos,
                ventas: totalVentasEfectivo + totalVentasTransferencia, // Solo ventas pagadas
                creditosOtorgados: totalCreditosOtorgados,
                pagosCxC: totalPagosCxC,
                transferencias: 0, // Ya no sumamos transferencias a los ingresos
                otros: otrosIngresos,
                cantidad: totalIngresosMovimientos,
                listaPagos: pagos,
                detallePagosCxC: {
                    efectivo: pagosCxCEfectivo,
                    transferencia: pagosCxCTransferencia,
                    otros: pagosCxCOtros
                },
                detalleVentas: {
                    efectivo: totalVentasEfectivo,
                    transferencia: totalVentasTransferencia,
                    credito: totalVentasCredito
                }
            },
            egresos: {
                total: totalEgresosGlobal,
                proveedores: totalPagosProveedores,
                proveedoresDetalle: {
                    efectivo: pagosProveedoresEfectivo,
                    transferencia: pagosProveedoresTransferencia,
                    otros: pagosProveedoresOtros
                },
                gastos: totalGastos,
                transferencias: 0, // Ya no sumamos transferencias a los egresos
                cantidad: totalEgresosMovimientos,
                listaProveedores: pagosProveedores,
                listaGastos: gastos
            },
            transferencias: {
                ingresos: transferencias.ingresos,
                egresos: transferencias.egresos,
                totalIngresos: transferencias.totalIngresos,
                totalEgresos: transferencias.totalEgresos,
                neto: transferencias.neto,
                todas: transferencias.todas
            },
            caja: {
                esperada: cajaEsperada,
                inicial: {
                    registro: cajaInicial,
                    monto: cajaInicialMonto
                },
                fisica: {
                    ingresos: cajaFisicaIngresos,
                    egresos: cajaFisicaEgresos,
                    total: cajaFisicaTotal
                },
                virtual: {
                    ingresos: cajaVirtualIngresos,
                    egresos: cajaVirtualEgresos,
                    movimientoHoy: cajaVirtualMovimiento,
                    saldoActual: saldoBanco,
                    ultimaActualizacion: saldoBancoFecha
                }
            }
        };
        
        console.log('✅ Resumen diario calculado:', {
            fecha: fechaISO,
            ingresos: resumen.ingresos.total,
            ventas: resumen.ventas.total,
            egresos: resumen.egresos.total,
            cajaFisica: resumen.caja.fisica.total,
            cajaVirtualMovimiento: resumen.caja.virtual.movimientoHoy,
            cajaEsperada: resumen.caja.esperada
        });
        
        return resumen;
    } catch (error) {
        console.error('Error al calcular resumen diario:', error);
        throw error;
    }
}

/**
 * Verifica si hay discrepancias importantes que requieran atención
 */
function verificarDiscrepancias(resumen) {
    const alertas = [];

    // Créditos otorgados y pagados el mismo día
    if (resumen.creditos.pagadosMismoDia.length > 0) {
        const totalDesfase = resumen.creditos.pagadosMismoDia.reduce(
            (sum, item) => sum + item.totalPagado, 0
        );
        alertas.push({
            tipo: 'info',
            mensaje: `Hay ${resumen.creditos.pagadosMismoDia.length} crédito(s) otorgado(s) y pagado(s) hoy. Desfase a favor: ${formatCurrency(totalDesfase)}`,
            icon: 'fa-info-circle'
        });
    }

    // Ventas a crédito pendientes
    if (resumen.ventas.credito > 0) {
        alertas.push({
            tipo: 'warning',
            mensaje: `Ventas a crédito hoy: ${formatCurrency(resumen.ventas.credito)} (no están en caja)`,
            icon: 'fa-exclamation-triangle'
        });
    }

    // Alto volumen de egresos
    if (resumen.egresos.total > resumen.ingresos.total) {
        alertas.push({
            tipo: 'warning',
            mensaje: `Los egresos (${formatCurrency(resumen.egresos.total)}) superan los ingresos (${formatCurrency(resumen.ingresos.total)})`,
            icon: 'fa-exclamation-circle'
        });
    }

    // Sin movimientos
    if (resumen.ventas.cantidad === 0 && resumen.ingresos.cantidad === 0 && resumen.egresos.cantidad === 0) {
        alertas.push({
            tipo: 'info',
            mensaje: 'No hay movimientos registrados hoy',
            icon: 'fa-info-circle'
        });
    }

    return alertas;
}

/**
 * Exporta los datos del dashboard a Excel (placeholder)
 */
function exportarDashboard(resumen) {
    console.log('Exportar dashboard:', resumen);
    alert('Funcionalidad de exportación en desarrollo');
    // TODO: Implementar exportación a Excel usando SheetJS
}

/**
 * Imprime el resumen del dashboard
 */
function imprimirDashboard() {
    window.print();
}

// =====================================================
// UTILIDADES CAJA INICIAL / CAJA DIARIA
// =====================================================

async function getCajaInicialPorFecha(fechaISO) {
    if (!fechaISO) return null;

    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('ferre_caja_inicial')
            .select('*')
            .eq('fecha', fechaISO)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('Error al obtener caja inicial:', error);
        return null;
    }
}

async function upsertCajaInicialRegistro(payload) {
    const supabase = getSupabaseClient();
    const registro = {
        fecha: payload.fecha,
        monto_inicial: payload.monto_inicial,
        observaciones: payload.observaciones || null,
        registrado_por: payload.registrado_por || null,
        registrado_por_email: payload.registrado_por_email || null,
        registrado_por_nombre: payload.registrado_por_nombre || null
    };

    const { data, error } = await supabase
        .from('ferre_caja_inicial')
        .upsert(registro, { onConflict: 'fecha' })
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}

async function getCajaDiariaPorFecha(fechaISO) {
    if (!fechaISO) return null;

    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('ferre_caja_diaria')
            .select('*')
            .eq('fecha', fechaISO)
            .maybeSingle();

        if (error) throw error;
        return data || null;
    } catch (error) {
        console.error('Error al obtener caja diaria:', error);
        return null;
    }
}

async function getCajaDiariaPorRango(fechaInicioISO, fechaFinISO) {
    if (!fechaInicioISO || !fechaFinISO) return [];

    try {
        const supabase = getSupabaseClient();
        let query = supabase
            .from('ferre_caja_diaria')
            .select('*')
            .order('fecha', { ascending: true });

        query = query.gte('fecha', fechaInicioISO);
        query = query.lte('fecha', fechaFinISO);

        const { data, error } = await query;
        if (error) throw error;
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error al obtener cajas diarias por rango:', error);
        return [];
    }
}

async function existeCajaDiariaAnterior(fechaISO) {
    if (!fechaISO) return { existe: false, registro: null };

    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('ferre_caja_diaria')
            .select('fecha')
            .lt('fecha', fechaISO)
            .order('fecha', { ascending: false })
            .limit(1);

        if (error) throw error;
        return {
            existe: Array.isArray(data) && data.length > 0,
            registro: Array.isArray(data) && data.length > 0 ? data[0] : null
        };
    } catch (error) {
        console.error('Error al verificar caja diaria previa:', error);
        return { existe: false, registro: null };
    }
}

async function crearCajaDiariaRegistro(payload) {
    const supabase = getSupabaseClient();
    const registro = {
        fecha: payload.fecha,
        caja_inicial_id: payload.caja_inicial_id,
        ventas_totales: payload.ventas_totales,
        ventas_ganancia: payload.ventas_ganancia,
        ingresos_total: payload.ingresos_total,
        egresos_total: payload.egresos_total,
        pagos_cxc_total: payload.pagos_cxc_total,
        transferencias_ingresos: payload.transferencias_ingresos,
        transferencias_egresos: payload.transferencias_egresos,
        pagos_proveedores_total: payload.pagos_proveedores_total,
        gastos_total: payload.gastos_total,
        caja_fisica_movimiento: payload.caja_fisica_movimiento,
        caja_fisica_esperada: payload.caja_fisica_esperada,
        caja_fisica_contada: payload.caja_fisica_contada,
        observaciones: payload.observaciones || null,
        caja_virtual_neta: payload.caja_virtual_neta,
        saldo_banco_final: payload.saldo_banco_final,
        billet_100: payload.billet_100 || 0,
        billet_50: payload.billet_50 || 0,
        billet_20: payload.billet_20 || 0,
        billet_10: payload.billet_10 || 0,
        billet_5: payload.billet_5 || 0,
        billet_2: payload.billet_2 || 0,
        billet_1: payload.billet_1 || 0,
        moneda_1: payload.moneda_1 || 0,
        moneda_050: payload.moneda_050 || 0,
        moneda_025: payload.moneda_025 || 0,
        moneda_010: payload.moneda_010 || 0,
        moneda_005: payload.moneda_005 || 0,
        moneda_001: payload.moneda_001 || 0,
        cerrado_por: payload.cerrado_por || null,
        cerrado_por_email: payload.cerrado_por_email || null,
        cerrado_por_nombre: payload.cerrado_por_nombre || null
    };

    const { data, error } = await supabase
        .from('ferre_caja_diaria')
        .insert(registro)
        .select()
        .maybeSingle();

    if (error) throw error;
    return data;
}
