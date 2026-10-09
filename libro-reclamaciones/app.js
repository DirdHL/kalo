import { supabase } from '../supabase.js';

document.addEventListener('DOMContentLoaded', async () => {

    // 1. Set current date
    const dateElement = document.getElementById('current-date');
    const today = new Date();
    dateElement.textContent = today.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // ID of the founding company as defined in the SQL schema
    const EMPRESA_ID = '550e8400-e29b-41d4-a716-446655440000';

    // 2. Fetch Correlative Number
    const correlativeElement = document.querySelector('.correlative-value');
    try {
        const { data, error } = await supabase
            .from('reclamaciones')
            .select('numero_correlativo')
            .order('numero_correlativo', { ascending: false })
            .limit(1);
        
        let nextNum = 1;
        if (data && data.length > 0) {
            nextNum = parseInt(data[0].numero_correlativo) + 1;
        }
        correlativeElement.textContent = nextNum.toString().padStart(6, '0');
    } catch (e) {
        console.error('No se pudo obtener correlativo:', e);
        correlativeElement.textContent = '000001';
    }

    // 3. Form Submission Handling
    const form = document.getElementById('reclamacion-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitLoader = document.getElementById('submit-loader');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // UI Feedback
        submitBtn.disabled = true;
        submitLoader.style.display = 'block';

        // Gather Form Data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());

        // Prepare payload mapping to the Supabase schema
        const payload = {
            empresa_id: EMPRESA_ID,

            // Sección 1
            nombre_consumidor: data.nombre_consumidor,
            documento_identidad_tipo: data.documento_identidad_tipo,
            documento_identidad_numero: data.documento_identidad_numero,
            domicilio_consumidor: data.domicilio_consumidor,
            telefono_consumidor: data.telefono_consumidor,
            email_consumidor: data.email_consumidor,
            nombre_apoderado: data.nombre_apoderado || null,

            // Sección 2
            tipo_bien: data.tipo_bien,
            monto_reclamado: parseFloat(data.monto_reclamado),
            descripcion_bien: data.descripcion_bien,

            // Sección 3
            tipo_reclamacion: data.tipo_reclamacion,
            detalle_reclamacion: data.detalle_reclamacion,
            pedido_consumidor: data.pedido_consumidor
        };

        try {
            // 1. Insertar en Supabase
            const { error } = await supabase
                .from('reclamaciones')
                .insert([payload]);

            if (error) throw error;

            // Enviar correo electrónico mediante FormSubmit (Sin backend)
            // Ya configuraste el correo: iibr.nuevohorizonte@gmail.com
            const emailDestino = 'iibr.nuevohorizonte@gmail.com';

            await fetch(`https://formsubmit.co/ajax/${emailDestino}`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    _subject: `Nueva Reclamación - ${payload.tipo_reclamacion}`,
                    Nombre: payload.nombre_consumidor,
                    Documento: `${payload.documento_identidad_tipo} ${payload.documento_identidad_numero}`,
                    Teléfono: payload.telefono_consumidor,
                    Email_Cliente: payload.email_consumidor,
                    Tipo_Bien: payload.tipo_bien,
                    Monto_Reclamado: payload.monto_reclamado,
                    Descripción: payload.descripcion_bien,
                    Detalle: payload.detalle_reclamacion,
                    Pedido: payload.pedido_consumidor
                })
            });

            console.log('Reclamación guardada en DB y correo enviado.');

            // Success feedback
            Swal.fire({
                title: '¡Formulario Registrado!',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 1.1rem; color: #2d3748; margin-bottom: 1rem;">Su <strong>${payload.tipo_reclamacion.toLowerCase()}</strong> ha sido ingresado correctamente a nuestro sistema y se le ha asignado el código de seguimiento automático.</p>
                        <p style="font-size: 0.95rem; color: #4a5568; line-height: 1.6;">En <strong>Bungalows de Tomayquichua</strong> nos tomamos muy en serio la calidad de nuestro servicio y la opinión de nuestros clientes. Nuestro equipo gerencial ha sido notificado y revisará su caso detalladamente para brindarle una respuesta formal al correo proporcionado en el menor tiempo posible.</p>
                        <hr style="margin: 1.5rem 0; border: 0; border-top: 1px solid #e2e8f0;">
                        <p style="font-size: 0.85rem; color: #718096; text-align: center;"><i>Gracias por ayudarnos a mejorar.</i></p>
                    </div>
                `,
                icon: 'success',
                confirmButtonText: 'Entendido',
                confirmButtonColor: '#1a365d',
                allowOutsideClick: false,
                customClass: {
                    popup: 'glass-panel'
                }
            }).then(() => {
                window.location.reload();
            });

        } catch (error) {
            console.error('Error al guardar la reclamación:', error);
            Swal.fire({
                title: 'Ocurrió un error',
                text: 'Hubo un problema de conexión al intentar registrar su solicitud. Por favor intente nuevamente en unos minutos.',
                icon: 'error',
                confirmButtonColor: '#e53e3e'
            });
        } finally {
            // Restore UI
            submitBtn.disabled = false;
            submitLoader.style.display = 'none';
        }
    });
});
