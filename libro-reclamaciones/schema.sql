-- Habilitar la extensión uuid-ossp si no está habilitada
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Empresas (Multi-tenant)
CREATE TABLE public.empresas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    razon_social VARCHAR(255) NOT NULL,
    nombre_comercial VARCHAR(255) NOT NULL,
    ruc VARCHAR(11) NOT NULL UNIQUE,
    direccion TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Tabla de Reclamaciones
CREATE TABLE public.reclamaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    numero_correlativo BIGSERIAL NOT NULL, -- O un trigger para que sea correlativo por empresa
    fecha_registro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- SECCIÓN 1: IDENTIFICACIÓN DEL CONSUMIDOR RECLAMANTE
    nombre_consumidor VARCHAR(255) NOT NULL,
    documento_identidad_tipo VARCHAR(20) NOT NULL CHECK (documento_identidad_tipo IN ('DNI', 'CE', 'PASAPORTE')),
    documento_identidad_numero VARCHAR(50) NOT NULL,
    domicilio_consumidor TEXT NOT NULL,
    telefono_consumidor VARCHAR(20) NOT NULL,
    email_consumidor VARCHAR(255) NOT NULL,
    nombre_apoderado VARCHAR(255), -- Opcional, para menores de edad

    -- SECCIÓN 2: IDENTIFICACIÓN DEL BIEN CONTRATADO
    tipo_bien VARCHAR(20) NOT NULL CHECK (tipo_bien IN ('PRODUCTO', 'SERVICIO')),
    monto_reclamado DECIMAL(10, 2) NOT NULL,
    descripcion_bien TEXT NOT NULL,

    -- SECCIÓN 3: DETALLE DE LA RECLAMACIÓN Y PEDIDO DEL CONSUMIDOR
    tipo_reclamacion VARCHAR(20) NOT NULL CHECK (tipo_reclamacion IN ('RECLAMO', 'QUEJA')),
    detalle_reclamacion TEXT NOT NULL,
    pedido_consumidor TEXT NOT NULL,

    -- SECCIÓN 4: OBSERVACIONES Y ACCIONES ADOPTADAS POR EL PROVEEDOR
    fecha_respuesta_proveedor DATE,
    observaciones_proveedor TEXT,
    aceptacion_consumidor BOOLEAN DEFAULT FALSE,
    validacion_proveedor BOOLEAN DEFAULT FALSE
);

-- Agregar un constraint de unicidad para el correlativo por empresa
ALTER TABLE public.reclamaciones ADD CONSTRAINT uk_reclamacion_empresa UNIQUE (empresa_id, numero_correlativo);

-- Insertar la empresa fundadora
INSERT INTO public.empresas (id, razon_social, nombre_comercial, ruc, direccion)
VALUES (
    '550e8400-e29b-41d4-a716-446655440000', -- UUID fijo para referencia fácil en el frontend (ejemplo)
    'INVERSIONES INMOBILIARIAS BIENES RAICES NUEVO HORIONTE S.R.L',
    'BUNGALOWS DE TOMAYQUICHUA',
    '20519442591',
    'AV. ALFREDO MENDIOLA N 3847 OFICINA 202 - LOS OLIVOS'
);

-- Políticas de Seguridad (RLS) - Opcional pero recomendado en Supabase
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reclamaciones ENABLE ROW LEVEL SECURITY;

-- Permitir lectura de empresas a todos (para cargar los datos en el frontend)
CREATE POLICY "Permitir lectura de empresas" ON public.empresas FOR SELECT USING (true);

-- Permitir insertar reclamaciones de forma anónima
CREATE POLICY "Permitir insertar reclamaciones" ON public.reclamaciones FOR INSERT WITH CHECK (true);
