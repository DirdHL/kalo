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

    // El correlativo lo asigna la base de datos al guardar. No puede predecirse
    // contando registros (y los reclamos no son de lectura pública).
    const correlativeElement = document.querySelector('.correlative-value');
    correlativeElement.textContent = 'Se asignará al registrar';

    // 3. Form Submission Handling
    const form = document.getElementById('reclamacion-form');
    const submitBtn = document.getElementById('submit-btn');
    const submitLoader = document.getElementById('submit-loader');

    let isSubmitting = false;
    let isRegistered = false;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (isSubmitting || isRegistered) return;
        isSubmitting = true;

        // UI Feedback
        submitBtn.disabled = true;
        submitLoader.style.display = 'block';

        // Gather Form Data
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const amount = Number(data.monto_reclamado);
        if (!data.monto_reclamado?.trim() || !Number.isFinite(amount) || amount < 0 || data.aceptacion_consumidor !== 'on') {
            isSubmitting = false;
            submitBtn.disabled = false;
            submitLoader.style.display = 'none';
            Swal.fire({
                title: 'Revise los datos',
                text: 'Ingrese un monto válido mayor o igual a cero y acepte la declaración del formulario.',
                icon: 'warning'
            });
            return;
        }

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
            monto_reclamado: amount,
            descripcion_bien: data.descripcion_bien,

            // Sección 3
            tipo_reclamacion: data.tipo_reclamacion,
            detalle_reclamacion: data.detalle_reclamacion,
            pedido_consumidor: data.pedido_consumidor,
            aceptacion_consumidor: true
        };

        try {
            // 1. Insertar en Supabase
            const { error } = await supabase
                .from('reclamaciones')
                .insert([payload]);

            if (error) throw error;
            isRegistered = true;

            // Enviar correo electrónico mediante FormSubmit
            const emailDestino = 'iibr.nuevohorizonte@gmail.com';
            let emailSent = false;
            const emailController = new AbortController();
            const emailTimeout = setTimeout(() => emailController.abort(), 10000);

            try {
                const response = await fetch(`https://formsubmit.co/ajax/${emailDestino}`, {
                    method: "POST",
                    signal: emailController.signal,
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
                if (!response.ok) throw new Error('El servicio de correo rechazó la notificación.');
                const result = await response.json();
                if (result.success !== true && result.success !== 'true') {
                    throw new Error('El servicio de correo no confirmó la notificación.');
                }
                emailSent = true;
            } catch (emailError) {
                console.error('Reclamación registrada; no se pudo enviar la notificación:', emailError);
            } finally {
                clearTimeout(emailTimeout);
            }

            console.log('Reclamación guardada en DB. Notificación enviada:', emailSent);

            // Success feedback
            Swal.fire({
                title: '¡Formulario Registrado!',
                html: `
                    <div style="text-align: left;">
                        <p style="font-size: 1.1rem; color: #2d3748; margin-bottom: 1rem;">Su solicitud ha sido ingresada correctamente a nuestro sistema.</p>
                        <p style="font-size: 0.95rem; color: #4a5568; line-height: 1.6;">En <strong>Bungalows de Tomayquichua</strong> nos tomamos muy en serio la calidad de nuestro servicio y la opinión de nuestros clientes. ${emailSent ? 'Nuestro equipo gerencial ha sido notificado.' : 'La solicitud quedó guardada, pero no pudimos enviar el aviso por correo. No necesita volver a registrarla.'} Su caso queda registrado para su revisión y respuesta al correo proporcionado.</p>
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
            isSubmitting = false;
            submitBtn.disabled = isRegistered;
            submitLoader.style.display = 'none';
        }
    });
});
