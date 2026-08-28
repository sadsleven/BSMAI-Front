import { useEffect, useState } from 'react';
import {
  BookOpen,
  ClipboardList,
  Wallet,
  HandCoins,
  Receipt,
  UserRound,
  BriefcaseMedical,
  Shield as ShieldIcon,
  FileText,
  Settings,
  Shield,
  BarChart3,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageBreadcrumbs } from '@/components/ui/page-breadcrumbs';

type Section = {
  id: string;
  title: string;
  icon: LucideIcon;
};

const SECTIONS: Section[] = [
  { id: 'intro', title: 'Introducción', icon: BookOpen },
  { id: 'orders', title: 'Órdenes — flujo de 4 pasos', icon: ClipboardList },
  { id: 'order-types', title: 'Tipos de orden', icon: FileText },
  { id: 'cashea', title: 'Órdenes Cashea', icon: HandCoins },
  { id: 'patients', title: 'Pacientes y titulares', icon: UserRound },
  { id: 'providers', title: 'Doctores y centros de atención', icon: BriefcaseMedical },
  { id: 'insurances', title: 'Seguros y contratistas', icon: ShieldIcon },
  { id: 'service-types', title: 'Tipos de servicio y precios', icon: Stethoscope },
  { id: 'accounts-payable', title: 'Cuentas por pagar', icon: Wallet },
  { id: 'accounts-receivable', title: 'Cuentas por cobrar', icon: HandCoins },
  { id: 'taxes-payable', title: 'Retenciones por pagar', icon: Receipt },
  { id: 'reports', title: 'Reportes', icon: BarChart3 },
  { id: 'admin', title: 'Administración', icon: Settings },
  { id: 'roles', title: 'Roles y permisos', icon: Shield },
];

function SectionHeader({
  icon: Icon,
  title,
  id,
}: {
  icon: LucideIcon;
  title: string;
  id: string;
}) {
  return (
    <div id={id} className="flex items-center gap-3 scroll-mt-24">
      <div className="w-10 h-10 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-[20px] font-bold tracking-[-0.01em]">{title}</h2>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center shrink-0">
        {n}
      </div>
      <div className="flex-1 space-y-1">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="text-sm text-muted-foreground space-y-2">{children}</div>
      </div>
    </div>
  );
}

function Note({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'success';
  children: React.ReactNode;
}) {
  const cls =
    tone === 'warning'
      ? 'bg-warning-soft/40 border-warning/30 text-warning'
      : tone === 'success'
        ? 'bg-success-soft/40 border-success/30 text-success'
        : 'bg-brand-blue-soft/40 border-brand-blue/30 text-brand-blue-strong';
  return (
    <div className={cn('rounded-md border px-3 py-2 text-xs', cls)}>{children}</div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  );
}

export function GuidePage() {
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -65% 0px', threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-6">
      <PageBreadcrumbs />
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-cyan-soft text-brand-cyan-strong flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight">
            Guía del sistema
          </h1>
          <p className="text-sm text-muted-foreground">
            Cómo usar AFMI — flujos de trabajo, módulos y conceptos clave. Pensado
            tanto para usuarios nuevos como para repaso rápido.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-8">
        {/* Contenido */}
        <div className="space-y-10 min-w-0">
          {/* Introducción */}
          <section className="space-y-3">
            <SectionHeader id="intro" icon={BookOpen} title="Introducción" />
            <p className="text-sm text-muted-foreground">
              AFMI gestiona el ciclo completo de órdenes médicas: desde la
              creación de la orden hasta la facturación, los pagos a proveedores y
              el cobro a seguros o titulares. Toda la moneda contable es USD; Bs y
              EUR sólo aparecen como métodos de pago que se convierten a USD vía
              tasa de cambio.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card title="Catálogos">
                Pacientes, doctores, centros, seguros, contratistas, tipos de
                servicio, patologías, especialidades, sucursales, tasas, unidades
                tributarias.
              </Card>
              <Card title="Operación">
                Órdenes (creación → atención → informe → facturación) +
                generación automática de cuentas por pagar / por cobrar /
                impuestos.
              </Card>
              <Card title="Administración">
                Usuarios, roles y permisos, configuración global del sistema
                (comisión Cashea, tasas tributarias).
              </Card>
            </div>
          </section>

          {/* Órdenes */}
          <section className="space-y-4">
            <SectionHeader id="orders" icon={ClipboardList} title="Órdenes — flujo de 4 pasos" />
            <p className="text-sm text-muted-foreground">
              Cada orden recorre 4 pasos canónicos. Solo se puede editar la
              información base mientras la orden no se haya atendido; los pasos posteriores tienen
              transiciones controladas.
            </p>
            <div className="space-y-4 pl-1">
              <Step n={1} title="Creación de orden (estado: orden creada)">
                <p>
                  Carga sucursal, tipo de orden, titular y paciente, patologías,
                  tipos de servicio con su especialidad y su proveedor (doctor o
                  centro) por fila, fechas y monto. Una misma orden puede
                  combinar especialidades: por ejemplo laboratorio en un centro y
                  rayos X en otro. Cada proveedor distinto genera su propia orden
                  interna en el Paso 2, con su número y con la especialidad de
                  sus servicios. El monto se prellena con los precios
                  Particular o del seguro según el tipo de orden, y puedes
                  editarlo para aplicar un descuento o un monto superior: al
                  diferir del precio de catálogo se exige el motivo y queda
                  registrado con tu usuario y la fecha.
                </p>
                <Note>
                  Si no tienes el permiso <code>orders.edit-amount</code>, el
                  monto queda forzado a la suma de catálogo. Puedes pedir
                  autorización a un validador desde el botón "Solicitar
                  autorización de monto".
                </Note>
              </Step>
              <Step n={2} title="Atención del paciente (estado: en proceso → atendida)">
                <p>
                  Una vez creada, descarga la "Orden interna" en XLSX por cada
                  tipo de servicio (una por proveedor distinto). Marca la orden
                  como atendida cuando se haya prestado el servicio.
                </p>
              </Step>
              <Step n={3} title="Informe médico y estudios (estado: informe emitido)">
                <p>
                  Adjunta estudios (PDF/imagen) y describe otros estudios libres.
                  Avanza la orden al estado "informe emitido".
                </p>
              </Step>
              <Step n={4} title="Facturación y liquidación (estado: finalizada)">
                <p>
                  Define cuánto cobra cada proveedor (doctor / centro) en USD,
                  elige la tasa USD/Bs con la que se emite la factura (snapshot{' '}
                  <code>billingExchangeRateId</code>) y finaliza. La tasa viene
                  precargada con aquella con la que más se pagó en bolívares y,
                  si no hubo pagos en Bs, con la más reciente vigente; en
                  órdenes de seguro no indexado es además la que fija en
                  bolívares la cuenta por cobrar. Una vez finalizada la orden es
                  inmutable salvo soft-delete.
                </p>
                <Note tone="success">
                  Tras finalizar aparecen las sub-secciones "Orden por pagar"
                  y, si aplica, "Orden por cobrar" para registrar pagos al
                  proveedor y cobros al seguro/titular directamente desde la
                  orden.
                </Note>
              </Step>
            </div>
          </section>

          {/* Tipos de orden */}
          <section className="space-y-4">
            <SectionHeader id="order-types" icon={FileText} title="Tipos de orden" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Contado (cash)">
                Cobro inmediato. Registra los pagos (efectivo USD/EUR/BS, pago
                móvil, transferencia, otro) directamente en la orden. No genera
                cuenta por cobrar.
              </Card>
              <Card title="Crédito (credit)">
                El titular adeuda el monto. Se genera una cuenta por cobrar al
                titular. Los cobros se registran desde "Cuentas por cobrar".
              </Card>
              <Card title="Seguro (insurance)">
                El seguro adeuda el monto según sus tarifas pactadas. Requiere
                seguro asociado al titular (directo o vía contratista). Genera
                cuenta por cobrar al seguro.
              </Card>
              <Card title="Cashea">
                El cliente paga una inicial y financia el resto vía Cashea, que
                retiene comisión y financiamiento configurables. Ver sección
                dedicada abajo.
              </Card>
            </div>
          </section>

          {/* Cashea */}
          <section className="space-y-4">
            <SectionHeader id="cashea" icon={HandCoins} title="Órdenes Cashea" />
            <p className="text-sm text-muted-foreground">
              El titular paga una <strong>inicial</strong> en el Paso 1 y Cashea
              financia el restante (total − inicial). El comercio recibe ese
              restante menos la comisión y el financiamiento que Cashea retiene.
              Cada cuota que Cashea remite llega como un cobro contra la cuenta
              por cobrar.
            </p>
            <div className="space-y-3">
              <Card title="Comisión y financiamiento">
                <p>
                  Los % de <strong>comisión</strong> (sobre el total) y de{' '}
                  <strong>financiamiento</strong> (sobre el restante) se
                  configuran en <strong>Administración → Configuración</strong>.
                  Al crear una orden Cashea se toma un <em>snapshot</em> de los %
                  vigentes — si después cambias los valores globales, las órdenes
                  históricas conservan los % con los que fueron creadas. La
                  inicial no genera comisión propia.
                </p>
              </Card>
              <Card title="Cuenta por cobrar">
                <p>
                  Cada orden Cashea genera automáticamente una cuenta por cobrar
                  con el titular como deudor. El total a cobrar es{' '}
                  <code>restante − comisión − financiamiento</code>, donde{' '}
                  <code>restante = total − inicial</code> — el monto neto que
                  Cashea le paga al comercio (la inicial ya la cobró el comercio
                  en el Paso 1).
                </p>
              </Card>
              <Card title="Registro de cuotas">
                <p>
                  Cada cuota recibida de Cashea (típicamente transferencia
                  bancaria) se registra como un cobro asociado a la cuenta por
                  cobrar. Cuando la suma de cobros alcanza el neto, la cuenta
                  pasa a "Cobrada".
                </p>
              </Card>
            </div>
            <Note tone="warning">
              Las tasas Cashea son por orden — modificarlas en Configuración no
              afecta órdenes ya creadas, sólo las nuevas.
            </Note>
          </section>

          {/* Pacientes */}
          <section className="space-y-4">
            <SectionHeader id="patients" icon={UserRound} title="Pacientes y titulares" />
            <p className="text-sm text-muted-foreground">
              Los pacientes pueden ser <strong>persona natural</strong> (cédula +
              nombre/apellido) o <strong>persona jurídica</strong> (razón social
              + RIF). El <strong>titular</strong> es quien financia la orden; el{' '}
              <strong>paciente</strong> puede ser el mismo titular o un tercero.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Seguros del paciente">
                <p>
                  Un paciente puede tener seguros <strong>directos</strong>{' '}
                  (asignados sin contratista) o <strong>vía
                  contratista</strong> (heredados de un contratista al que
                  pertenece). El selector de seguro en la orden lista ambos
                  caminos.
                </p>
              </Card>
              <Card title="Creación inline">
                <p>
                  Desde el selector de paciente en la orden puedes crear un nuevo
                  paciente sin salir del formulario con el botón "+ Crear".
                </p>
              </Card>
            </div>
          </section>

          {/* Doctores / Centros */}
          <section className="space-y-4">
            <SectionHeader
              id="providers"
              icon={BriefcaseMedical}
              title="Doctores y centros de atención"
            />
            <p className="text-sm text-muted-foreground">
              Los doctores y centros son los <strong>proveedores</strong> de los
              tipos de servicio. Una orden puede combinar varios tipos de
              servicio prestados por distintos proveedores. Cada fila ST elige
              su proveedor.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Doctores">
                <p>
                  Persona natural o jurídica (RIF condicional). Especialidades
                  M2M (1+), métodos de pago, precios por tipo de servicio. La
                  tasa de retención de impuestos depende de si es persona
                  jurídica.
                </p>
              </Card>
              <Card title="Centros de atención">
                <p>
                  Siempre razón social. Especialidades M2M (1+), métodos de
                  pago, precios por tipo de servicio. No retención de impuestos
                  por defecto.
                </p>
              </Card>
            </div>
          </section>

          {/* Seguros / Contratistas */}
          <section className="space-y-4">
            <SectionHeader id="insurances" icon={ShieldIcon} title="Seguros y contratistas" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Seguros">
                <p>
                  Cada seguro define sus <strong>precios por tipo de
                  servicio</strong> (USD). Esos precios son los que se usan
                  para calcular el monto de las órdenes tipo seguro. Si falta el
                  precio de algún ST, el sistema bloquea la creación.
                </p>
              </Card>
              <Card title="Contratistas">
                <p>
                  Empresas que tienen contratos con seguros. Cuando un paciente
                  está asignado a un contratista, hereda los seguros de ese
                  contratista. Útil para clientes corporativos.
                </p>
              </Card>
            </div>
          </section>

          {/* Service Types */}
          <section className="space-y-4">
            <SectionHeader id="service-types" icon={Stethoscope} title="Tipos de servicio y precios" />
            <p className="text-sm text-muted-foreground">
              Los tipos de servicio (ST) tienen un{' '}
              <strong>precio Particular</strong> (USD, opcional) que se usa por
              defecto en órdenes no-seguro. Los precios para seguros, doctores y
              centros se configuran en cada uno de esos módulos.
            </p>
            <Note>
              Si un ST no tiene precio para una combinación dada, aparece
              "Sin precio definido" en color de advertencia. En órdenes tipo
              seguro esto bloquea la creación.
            </Note>
          </section>

          {/* Accounts Payable */}
          <section className="space-y-4">
            <SectionHeader id="accounts-payable" icon={Wallet} title="Cuentas por pagar" />
            <p className="text-sm text-muted-foreground">
              Cada orden finalizada genera <strong>una cuenta por pagar por
              proveedor distinto</strong> (doctor o centro). Es lo que el
              comercio le debe al proveedor por su trabajo.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Para registrar un pago: marca las cuentas a pagar (deben ser del
                mismo proveedor), elige "Registrar pago" y carga los métodos de
                pago (efectivo USD/EUR/BS, transferencia, etc.). La suma debe
                cuadrar con el monto a recibir tras retención de impuestos.
              </p>
              <p>
                Estados: <code>unpaid</code> → <code>partially_paid</code> →{' '}
                <code>paid</code>.
              </p>
            </div>
          </section>

          {/* Accounts Receivable */}
          <section className="space-y-4">
            <SectionHeader id="accounts-receivable" icon={HandCoins} title="Cuentas por cobrar" />
            <p className="text-sm text-muted-foreground">
              Se generan al crear órdenes tipo <strong>Seguro</strong>,{' '}
              <strong>Crédito</strong> o <strong>Cashea</strong>. El deudor es
              el seguro (insurance) para las primeras, o el titular (holder)
              para las otras dos.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Para registrar un cobro: marca las cuentas (deben compartir
                deudor) y elige "Registrar cobro". Los cobros se acumulan; la
                cuenta pasa a <code>collected</code> al alcanzar el target o{' '}
                <code>overcollected</code> si lo supera.
              </p>
              <p>
                Para Cashea, el target es el neto (restante menos comisión y
                financiamiento). El listado y el detalle muestran ambos valores
                para claridad.
              </p>
            </div>
          </section>

          {/* Taxes Payable */}
          <section className="space-y-4">
            <SectionHeader id="taxes-payable" icon={Receipt} title="Retenciones por pagar" />
            <p className="text-sm text-muted-foreground">
              Por cada pago a un doctor se retiene un % de impuesto (3% persona
              natural, 5% persona jurídica — configurable vía variables de
              entorno). Esa retención queda como impuesto por pagar al SENIAT,
              que luego se registra como pagado al SENIAT.
            </p>
          </section>

          {/* Reports */}
          <section className="space-y-4">
            <SectionHeader id="reports" icon={BarChart3} title="Reportes" />
            <p className="text-sm text-muted-foreground">
              Reportes operativos y gerenciales. Cada reporte tiene su propio
              permiso — pueden visibilizarse selectivamente por rol. Todos
              soportan filtros de fecha y exportación según el reporte.
            </p>

            <h3 className="text-sm font-semibold pt-2">Vista ejecutiva</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Panel ejecutivo">
                <p>
                  Dashboard gerencial todo-en-uno con tres secciones: flujo de
                  caja mensual con KPIs, análisis de órdenes (volumen y mezcla
                  por tipo, especialidad y aseguradora) y cobranzas por
                  aseguradora. Un solo filtro de fecha aplica a toda la página.
                </p>
              </Card>
              <Card title="Resumen financiero">
                <p>
                  Ingresos vs egresos por mes. Ingresos = cobros recibidos;
                  egresos = pagos a proveedores + impuestos. Vista neta
                  mensual.
                </p>
              </Card>
            </div>

            <h3 className="text-sm font-semibold pt-2">Cuentas por cobrar</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Cuentas por cobrar (detallado)">
                <p>
                  Listado completo de cuentas por cobrar con su estado, target,
                  cobrado y pendiente. Filtrable por deudor (seguro / titular)
                  y estado.
                </p>
              </Card>
              <Card title="Cobros recibidos">
                <p>
                  Listado cronológico de cobros registrados contra cuentas por
                  cobrar. Detalle por método de pago, banco, referencia, monto
                  USD/Bs/EUR.
                </p>
              </Card>
              <Card title="Antigüedad de saldos (aging)">
                <p>
                  Distribución de cuentas por cobrar y por pagar en buckets de
                  antigüedad (0-30, 31-60, 61-90, 90+ días). Identifica saldos
                  vencidos.
                </p>
              </Card>
            </div>

            <h3 className="text-sm font-semibold pt-2">Cuentas por pagar</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Cuentas por pagar (detallado)">
                <p>
                  Listado completo de cuentas por pagar a proveedores (doctores
                  / centros) con su estado, monto y pagado. Filtrable por
                  proveedor y estado.
                </p>
              </Card>
              <Card title="Pagos emitidos">
                <p>
                  Listado cronológico de pagos hechos a proveedores y al SENIAT
                  (impuestos). Detalle por método, banco, referencia.
                </p>
              </Card>
            </div>

            <h3 className="text-sm font-semibold pt-2">Producción</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Producción por médico">
                <p>
                  Ingresos generados, órdenes atendidas y monto pagado a cada
                  doctor en el período. Sirve para evaluar productividad y
                  liquidación.
                </p>
              </Card>
              <Card title="Producción por aseguradora">
                <p>
                  Volumen facturado a cada seguro: cantidad de órdenes, monto
                  total, monto cobrado, monto pendiente. Mide peso comercial
                  de cada aseguradora.
                </p>
              </Card>
              <Card title="Servicios facturados">
                <p>
                  Demanda por tipo de servicio: cuántas veces se facturó cada
                  ST, ingresos asociados. Sirve para detectar servicios más y
                  menos solicitados.
                </p>
              </Card>
              <Card title="Seguimiento de órdenes">
                <p>
                  Distribución de órdenes por etapa del flujo (orden creada, en
                  proceso, atendida, informe emitido, finalizada). Detecta
                  cuellos de botella operativos.
                </p>
              </Card>
            </div>

            <h3 className="text-sm font-semibold pt-2">Impuestos</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Impuestos retenidos">
                <p>
                  Detalle de retenciones aplicadas a doctores (3% persona
                  natural / 5% persona jurídica). Sirve para reportar al
                  SENIAT y conciliar Retenciones por pagar.
                </p>
              </Card>
            </div>

            <Note>
              Cada reporte requiere su permiso específico (
              <code>reports.&lt;nombre&gt;.list</code>). Asígnalo al rol que
              corresponda para que aparezca en la barra lateral.
            </Note>
          </section>

          {/* Admin */}
          <section className="space-y-4">
            <SectionHeader id="admin" icon={Settings} title="Administración" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Card title="Sucursales">
                <p>
                  Cada usuario tiene acceso a un conjunto de sucursales. Las
                  órdenes pertenecen a una sucursal y sólo son visibles para
                  usuarios con acceso a esa sucursal (Super Admin ve todas).
                </p>
              </Card>
              <Card title="Tasas de cambio">
                <p>
                  USD/Bs y EUR/Bs. Una tasa es histórica: nunca se sobreescribe
                  — un cambio crea una fila nueva con su fecha efectiva. Las
                  órdenes guardan snapshot al facturar.
                </p>
              </Card>
              <Card title="Unidades tributarias">
                <p>
                  Valor de la UT vigente en bolívares según Gaceta Oficial. La
                  UT vigente es la más reciente con fecha efectiva ≤ hoy.
                </p>
              </Card>
              <Card title="Configuración">
                <p>
                  Parámetros globales editables del sistema. Hoy: % de comisión
                  y de financiamiento Cashea. Los cambios sólo afectan las
                  nuevas órdenes.
                </p>
              </Card>
            </div>
          </section>

          {/* Roles */}
          <section className="space-y-4">
            <SectionHeader id="roles" icon={Shield} title="Roles y permisos" />
            <p className="text-sm text-muted-foreground">
              Los permisos siguen el formato <code>recurso.acción</code>. Se
              agrupan en roles. Cada usuario tiene uno o más roles. El{' '}
              <strong>Super Admin</strong> bypassa todos los permisos.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Para dar acceso a un módulo: edita el rol del usuario y asigna
                los permisos correspondientes desde la sección Permisos. Algunas
                acciones combinadas (ej. ver el monto de proveedores en Paso 4)
                requieren un permiso específico aparte del{' '}
                <code>update</code>.
              </p>
              <Note>
                El rol <strong>Super Admin</strong> es un rol de sistema — no se
                puede editar ni eliminar.
              </Note>
            </div>
          </section>
        </div>

        {/* TOC sticky */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-2">
              En esta página
            </div>
            <nav className="space-y-0.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = activeId === s.id;
                return (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className={cn(
                      'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
                      active
                        ? 'bg-brand-cyan-soft text-brand-blue-strong font-semibold'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{s.title}</span>
                  </a>
                );
              })}
            </nav>
          </div>
        </aside>
      </div>

    </div>
  );
}
