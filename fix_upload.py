import re
import os

html_files = ['brisas.html', 'pinos.html', 'polideportivo.html']
upload_html = '''
            <h2 style="margin-bottom: 0.5rem;">Escoger Imagen 📸</h2>
            <div style="margin-bottom: 1rem; text-align: center;">
                <label for="customImageUpload" class="primary-btn" style="cursor: pointer; display: inline-block; width: auto; padding: 0.6rem 1.5rem; background: #6366f1;">
                    📁 Subir Imagen (Celular / PC)
                </label>
                <input type="file" id="customImageUpload" accept="image/*" style="display: none;">
            </div>
            <p style="color: var(--text-secondary); margin-bottom: 1rem; font-size: 0.9rem;">O escoge una imagen predeterminada del sistema:</p>
'''

for f in html_files:
    if os.path.exists(f):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        # Replace the header of the image picker modal
        pattern = re.compile(r'<h2 style="margin-bottom: 1\.5rem;">Escoger Imagen 📸</h2>\s*<p style="color: var\(--text-secondary\); margin-bottom: 1rem; font-size: 0\.9rem;">Haz clic en la fotografía que corresponda al producto\.</p>')
        content = pattern.sub(upload_html.strip(), content)
        
        with open(f, 'w', encoding='utf-8') as file:
            file.write(content)
        print(f'Updated {f}')

# Update inventory.js
with open('inventory.js', 'r', encoding='utf-8') as file:
    inv_js = file.read()

# Fix image paths
inv_js = inv_js.replace("previewImg.src = selectedImageName ? `./img/${selectedImageName}` : './kalo-logo.png';", "previewImg.src = selectedImageName ? (selectedImageName.startsWith('data:') || selectedImageName.startsWith('http') ? selectedImageName : `./img/${selectedImageName}`) : './kalo-logo.png';")
inv_js = inv_js.replace("const imgSrc = prod.imagen ? `./img/${prod.imagen}` : './img/kalo-logo.png';", "const imgSrc = prod.imagen ? (prod.imagen.startsWith('data:') || prod.imagen.startsWith('http') ? prod.imagen : `./img/${prod.imagen}`) : './img/kalo-logo.png';")

# Add file listener logic inside setupInventory() near the end of DOM selections (around line 43)
upload_js = '''
    const customImageUpload = document.getElementById('customImageUpload');
    if (customImageUpload) {
        customImageUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 250;
                    const MAX_HEIGHT = 250;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                    } else {
                        if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    selectedImageName = canvas.toDataURL('image/webp', 0.8);
                    
                    if (isComboImagePicker) {
                        const comboPreviewImg = document.getElementById('comboPreviewImg');
                        if (comboPreviewImg) comboPreviewImg.src = selectedImageName;
                    } else {
                        const previewImg = document.getElementById('previewImg');
                        if (previewImg) previewImg.src = selectedImageName;
                    }
                    if (imagePickerModal) imagePickerModal.classList.add('hidden');
                    customImageUpload.value = ''; // Reset
                };
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    }
'''

if 'customImageUpload' not in inv_js:
    inv_js = inv_js.replace("const comboModal = document.getElementById('comboModal');", "const comboModal = document.getElementById('comboModal');" + upload_js)

with open('inventory.js', 'w', encoding='utf-8') as file:
    file.write(inv_js)
print("Updated inventory.js")


# Update pos.js
with open('pos.js', 'r', encoding='utf-8') as file:
    pos_js = file.read()

pos_js = pos_js.replace("const imgSrc = prod.imagen ? `./img/${prod.imagen}` : './img/kalo-logo.png';", "const imgSrc = prod.imagen ? (prod.imagen.startsWith('data:') || prod.imagen.startsWith('http') ? prod.imagen : `./img/${prod.imagen}`) : './img/kalo-logo.png';")

with open('pos.js', 'w', encoding='utf-8') as file:
    file.write(pos_js)
print("Updated pos.js")

