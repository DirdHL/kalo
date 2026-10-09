document.addEventListener('DOMContentLoaded', () => {

    // 1. Set current date
    const dateElement = document.getElementById('current-date');
    const today = new Date();
    dateElement.textContent = today.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    // 2. Supabase Configuration (Mock/Template)
    // Replace these with your actual Supabase project URL and anon key
    const SUPABASE_URL = 'https://xyzcompany.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_glXjG1vnuH4r_GFYNmGjbQ_yY_dqP4L';

    // Initialize Supabase Client
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // ID of the founding company as defined in the SQL schema
    const EMPRESA_ID = '550e8400-e29b-41d4-a716-446655440000';

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
            // Uncomment the following block to actually insert into Supabase
            /*
            const { data: responseData, error } = await supabase
                .from('reclamaciones')
                .insert([payload])
                .select();

            if (error) throw error;
            */

            // Simulate API Call for demonstration
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('Payload a enviar a Supabase:', payload);

            // Success feedback
            alert('Su hoja de reclamación ha sido registrada exitosamente. Nos pondremos en contacto con usted.');
            form.reset();

        } catch (error) {
            console.error('Error al guardar la reclamación:', error);
            alert('Ocurrió un error al registrar la reclamación. Por favor intente nuevamente.');
        } finally {
            // Restore UI
            submitBtn.disabled = false;
            submitLoader.style.display = 'none';
        }
    });
});
