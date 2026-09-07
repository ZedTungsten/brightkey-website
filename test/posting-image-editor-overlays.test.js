import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../dashboard/posting/image-editor/index.html', import.meta.url), 'utf8');
const editor = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor.js', import.meta.url), 'utf8');
const projects = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-projects.js', import.meta.url), 'utf8');
const effects = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-effects.js', import.meta.url), 'utf8');
const properties = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-properties.js', import.meta.url), 'utf8');
const mediaBrowser = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-media-browser.js', import.meta.url), 'utf8');
const stagePan = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor-stage-pan.js', import.meta.url), 'utf8');
const styles = fs.readFileSync(new URL('../dashboard/posting/image-editor/image-editor.css', import.meta.url), 'utf8');

test('posting image editor no longer exposes or applies watermark and template overlays', () => {
  assert.doesNotMatch(page, /open-watermark-modal|open-template-modal|overlay-modal|overlay-file|apply-overlay/);
  assert.doesNotMatch(editor, /state\.overlays|draftOverlay|openOverlay|loadOverlay|drawOverlayPreview|previewPointer/);
  assert.doesNotMatch(projects, /const overlays =|app\.state\.overlays|overlays\s*$/m);
});

test('deleting historical projects still cleans up retired overlay assets', () => {
  assert.match(projects, /Historical projects may still own retired overlay assets/);
  assert.match(projects, /manifest\.overlays\?\.\[type\]\?\.path/);
});

test('image editor toolbar and background value use the compact requested layout', () => {
  assert.doesNotMatch(page, /<span class="tool-kicker">Canvas<\/span>/);
  assert.match(page, /<div class="tool-heading"><h2>Canvas size<\/h2><span id="canvas-size-label">/);
  assert.match(styles, /\.editor-toolbar #fill-height \{ margin-left: auto; \}/);
  assert.match(styles, /\.color-control input\[type="text"\] \{[^}]*font-size: 0\.72rem;/);
  assert.match(styles, /\.canvas-zoom \{[^}]*background: #FFFFFF;/);
  assert.match(styles, /\.canvas-zoom input \{[^}]*#E4E4E7/);
  assert.match(editor, /zoomSlider\.style\.setProperty\('--zoom-progress'/);
});

test('canvas sidebar keeps creation as its only action and saves dimensions beside the fields', () => {
  assert.doesNotMatch(page, /load-canvas-dimensions|>Load Canvas<\/button>/);
  assert.doesNotMatch(page, /id="canvas-save-actions"/);
  assert.match(page, /id="canvas-height"[\s\S]{0,250}id="save-canvas-dimensions"[\s\S]*>Save Canvas<\/button>/);
  assert.match(styles, /\.size-grid \{[^}]*grid-template-columns: 1fr auto 1fr auto/);
  assert.doesNotMatch(projects, /save-canvas-dimensions'\)\.disabled/);
  assert.match(editor, /company_id: state\.companyId,[\s\S]*name,[\s\S]*width,[\s\S]*height,[\s\S]*project_data: null/);
  assert.match(editor, /document\.getElementById\('open-size-modal'\)\.addEventListener\('click', openSizeModal\)/);
  assert.match(page, /id="open-size-modal"[^>]*class="btn btn-cyan create-canvas-button">Create New Canvas<\/button>/);
  assert.doesNotMatch(page, /id="open-size-modal"[\s\S]{0,200}<svg/);
  assert.match(page, /id="open-size-modal"[\s\S]{0,300}for="background-hex">Canvas Color/);
  assert.doesNotMatch(page, />Background color<\/label>/);
});

test('image editor accepts HEIC uploads and converts them to JPEG before loading', () => {
  assert.match(page, /accept="[^"]*image\/heic[^"]*\.heic[^"]*"/);
  assert.match(page, /heic2any@0\.0\.4\/dist\/heic2any\.min\.js/);
  assert.match(editor, /function isHeicFile\(file\)/);
  assert.match(editor, /window\.heic2any\(\{ blob: file, toType: 'image\/jpeg', quality: 0\.9 \}\)/);
  assert.match(editor, /new File\(\[jpeg\], `\$\{baseName\}\.jpg`/);
  assert.match(editor, /const prepared = await Promise\.all\(valid\.map\(prepareImageFile\)\)/);
});

test('canvas clicks select the topmost visible image instead of the previously active image', () => {
  const hitTest = editor.slice(editor.indexOf('function canvasTargetAt(point)'), editor.indexOf('function updateCanvasCursor(point)'));
  assert.doesNotMatch(hitTest, /contains\(active, localPoint\)/);
  assert.doesNotMatch(hitTest, /if \(index === state\.activeIndex\) continue/);
  assert.match(hitTest, /for \(let index = state\.images\.length - 1; index >= 0; index -= 1\)/);
});

test('top-left selection handle duplicates the active image ten pixels away and directly above its layer', () => {
  assert.match(editor, /function isDuplicateHandle\(target, point, handleSize\)/);
  assert.match(editor, /action === 'duplicate' \? 'copy'/);
  assert.match(editor, /const duplicate = \{ \.\.\.target, x: target\.x \+ 10, y: target\.y \+ 10/);
  assert.match(editor, /const duplicateIndex = originalIndex >= 0 \? originalIndex \+ 1 : state\.images\.length/);
  assert.match(editor, /state\.images\.splice\(duplicateIndex, 0, duplicate\)/);
  assert.match(editor, /state\.activeIndex = duplicateIndex/);
  assert.match(editor, /if \(action === 'duplicate'\) \{\s*duplicateImage\(target\)/);
});

test('header download exports a flattened PNG at the exact canvas dimensions', () => {
  assert.match(page, /id="header-load-canvas"[\s\S]*>Load File<\/button>/);
  assert.match(page, /header-save-canvas[\s\S]*header-download-canvas[\s\S]*>Download<\/button>/);
  assert.match(projects, /header-download-canvas'\)\.disabled = !app\.state\.canvasReady/);
  assert.match(editor, /async function downloadCanvas\(\)/);
  assert.match(editor, /const blob = await canvasBlob\(\)/);
  assert.match(editor, /link\.download = `\$\{baseName\}\.png`/);
  assert.match(editor, /Downloaded \$\{state\.width\} × \$\{state\.height\} PNG/);
});

test('load modal uses checkbox selection with bulk duplicate and delete actions', () => {
  assert.doesNotMatch(page, /saved-canvases-list[\s\S]{0,300}<button class="btn btn-outline" type="button" data-close-modal>Close/);
  assert.match(page, /saved-file-bulk-actions"[\s\S]*duplicate-selected-documents[\s\S]*disabled>Duplicate[\s\S]*delete-selected-documents[\s\S]*disabled>Delete/);
  assert.doesNotMatch(page, /load-selected-document/);
  assert.match(projects, /checkbox\.dataset\.selectCanvasId = saved\.id/);
  assert.match(projects, /loadButton\.dataset\.canvasId = saved\.id/);
  assert.match(projects, /bucket\.copy\(source, destination\)/);
  assert.match(projects, /\.in\('id', ids\)\.eq\('company_id', app\.state\.companyId\)/);
});

test('saved document duplicates use incrementing copy-number suffixes', () => {
  assert.match(projects, /function duplicateName\(name\)/);
  assert.match(projects, /return `\$\{value\} \(copy 1\)`/);
  assert.match(projects, /Number\(match\[2\]\) \+ 1/);
  assert.match(projects, /name: duplicateName\(saved\.name\)/);
});

test('load modal shows a selected-file count and searchable saved-file list', () => {
  assert.doesNotMatch(page, /Select a saved file to continue editing/);
  assert.match(page, /id="selected-files-count" hidden>Selected files: 0/);
  assert.match(page, /id="saved-files-search"[\s\S]*placeholder="Search saved files"/);
  assert.match(projects, /Selected file\$\{count === 1 \? '' : 's'\}: \$\{count\}/);
  assert.match(projects, /String\(saved\.name \|\| ''\)\.toLowerCase\(\)\.includes\(searchQuery\)/);
  assert.match(editor, /saved-files-search'\)\.addEventListener\('input'/);
});

test('saved-file selection controls hide the zero count and select visible search results', () => {
  assert.match(page, /saved-canvases-search[\s\S]*saved-selection-summary/);
  assert.match(page, /id="selected-files-count" hidden/);
  assert.match(page, /id="select-all-saved-files"[\s\S]*>Select All<\/button>/);
  assert.match(page, /id="deselect-all-saved-files"[\s\S]*hidden>Deselect All<\/button>/);
  assert.doesNotMatch(page, /saved-canvases-search[^>]*>[\s\S]{0,100}<svg/);
  assert.match(projects, /countNode\.hidden = count === 0/);
  assert.match(projects, /visibleProjects\(\)\.forEach\(saved => selectedProjectIds\.add\(saved\.id\)\)/);
  assert.match(editor, /select-all-saved-files'\)\.addEventListener\('click', projects\.selectAllVisible\)/);
});

test('saved-file rows reveal checkboxes on interaction and keep Load in each row', () => {
  assert.match(styles, /\.saved-canvas-select \{[^}]*opacity: 0;[^}]*pointer-events: none/);
  assert.match(styles, /\.saved-canvas-card:hover \.saved-canvas-select,\.saved-canvas-card\.selected \.saved-canvas-select,\.saved-canvas-select:focus/);
  assert.match(projects, /duplicate-selected-documents'\)\.disabled = count === 0/);
  assert.match(projects, /delete-selected-documents'\)\.disabled = count === 0/);
  assert.match(editor, /const row = event\.target\.closest\('\.saved-canvas-card'\)/);
  assert.match(editor, /projects\.toggleSelection\(checkbox\.dataset\.selectCanvasId, !checkbox\.checked\)/);
});

test('saved-file rows support hover-only inline rename controls', () => {
  assert.match(styles, /\.saved-canvas-edit \{[^}]*opacity: 0/);
  assert.match(styles, /\.saved-canvas-card:hover \.saved-canvas-edit/);
  assert.match(projects, /editButton\.dataset\.editCanvasId = saved\.id/);
  assert.match(projects, /name\.value = saved\.name/);
  assert.match(projects, /cancelButton\.dataset\.cancelRenameId = saved\.id/);
  assert.match(projects, /applyButton\.dataset\.applyRenameId = saved\.id/);
  assert.match(projects, /\.update\(\{ name, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(editor, /projects\.applyRename\(applyRename\.dataset\.applyRenameId/);
});

test('saving an existing company filename requires custom overwrite confirmation', () => {
  assert.match(page, /id="overwrite-document-modal"[\s\S]*Overwrite file\?[\s\S]*data-cancel-overwrite>Cancel[\s\S]*btn btn-success[\s\S]*>Overwrite<\/button>/);
  assert.match(projects, /function findNameConflict\(name\)/);
  assert.match(projects, /\.eq\('company_id', app\.state\.companyId\)[\s\S]*\.eq\('name', name\)/);
  assert.match(projects, /if \(app\.state\.currentProjectId\) query = query\.neq\('id', app\.state\.currentProjectId\)/);
  assert.match(projects, /document\.getElementById\('overwrite-document-name'\)\.textContent = name/);
  assert.match(projects, /async function confirmOverwrite\(button\)/);
  assert.match(projects, /const replacedPaths = projectAssetPaths\(overwriteTarget\)/);
  assert.match(editor, /confirm-overwrite-document'\)\.addEventListener\('click'/);
});

test('loading over changes requires discard or direct save of the current document', () => {
  assert.match(page, /id="load-unsaved-document-modal" data-static-modal[\s\S]*Discard Changes[\s\S]*btn btn-success[\s\S]*Save Changes/);
  assert.match(projects, /function requestLoad\(saved, button\)/);
  assert.match(projects, /if \(!app\.state\.projectDirty\) \{[\s\S]*load\(saved, button\)/);
  assert.match(projects, /saved = await save\(null, true\)/);
  assert.match(projects, /closeModal\(document\.getElementById\('load-unsaved-document-modal'\)\)[\s\S]*saved = await saveBeforeLeave\(\)/);
  assert.match(projects, /if \(!saved && pendingLoad\) app\.openModal\(document\.getElementById\('load-unsaved-document-modal'\)\)/);
  assert.match(projects, /async function save\(overwriteTarget = null, skipNameCheck = false\)/);
  assert.match(editor, /projects\.requestLoad\(saved, loadButton\)/);
  assert.match(editor, /discard-current-document-changes'\)\.addEventListener\('click', projects\.discardChangesAndLoad\)/);
});

test('selected images support persisted drop-shadow and glow effects', () => {
  assert.match(page, /id="image-effects"[\s\S]*Drop Shadow[\s\S]*id="shadow-color"[\s\S]*id="shadow-opacity"[\s\S]*id="shadow-distance"[\s\S]*id="shadow-blur"/);
  assert.match(page, /id="image-effects"[\s\S]*Glow[\s\S]*id="glow-color"[\s\S]*id="glow-opacity"[\s\S]*id="glow-blur"/);
  assert.match(effects, /dropShadow: \{ enabled: false, color: '#000000', opacity: 60, distance: 20, blur: 20 \}/);
  assert.match(effects, /glow: \{ enabled: false, color: '#FFFFFF', opacity: 70, distance: 0, blur: 30 \}/);
  assert.match(effects, /!config\?\.enabled/);
  assert.match(effects, /surfaceContext\.shadowColor = rgba/);
  assert.match(effects, /globalCompositeOperation = 'destination-out'/);
  assert.match(editor, /effects: effects\.clone\(target\.effects\)/);
  assert.match(projects, /effects: entry\.effects \|\| null/);
});

test('image effect selector shows only the chosen effect settings', () => {
  assert.match(page, /id="image-effect-trigger"[\s\S]*id="image-effect-menu"[\s\S]*id="drop-shadow-enabled"[\s\S]*data-effect-view="dropShadow"[\s\S]*id="glow-enabled"[\s\S]*data-effect-view="glow"/);
  assert.match(page, /data-effect="dropShadow"/);
  assert.match(page, /data-effect="glow" hidden/);
  assert.match(effects, /group\.hidden = group\.dataset\.effect !== selectedEffect/);
  assert.match(effects, /selectedEffect = button\.dataset\.effectView/);
  assert.match(styles, /\.effect-group\[hidden\] \{ display: none; \}/);
  assert.match(page, /id="drop-shadow-enabled" type="checkbox"/);
  assert.match(page, /id="glow-enabled" type="checkbox"/);
  assert.doesNotMatch(page, /id="glow-distance/);
  assert.match(effects, /change\('dropShadow', 'enabled', event\.target\.checked\)/);
  assert.match(effects, /change\('glow', 'enabled', event\.target\.checked\)/);
});

test('image property and effect values accept typed numeric edits', () => {
  assert.match(page, /id="image-width-value" type="number"/);
  assert.match(page, /id="image-height-value" type="number"/);
  assert.match(page, /id="image-rotation-value" type="number"/);
  assert.match(page, /id="image-opacity-value" type="number"/);
  assert.match(page, /id="shadow-opacity-value" type="number"/);
  assert.match(page, /id="glow-blur-value" type="number"/);
  assert.match(properties, /commitDimensions/);
  assert.match(properties, /commitValue\('image-opacity-value'/);
  assert.match(effects, /valueInput\.addEventListener\('change'/);
  assert.match(styles, /\.editable-property-value input:focus/);
  assert.match(styles, /caret-color: currentColor/);
  assert.match(styles, /\.effect-range > input\[type="range"\]/);
  assert.doesNotMatch(styles, /\.effect-range input \{/);
});

test('blank canvas space uses grab-to-pan without replacing image interactions', () => {
  assert.match(editor, /interactionCanvas\.style\.cursor = .*'grab'/);
  assert.match(editor, /state\.pan = \{/);
  assert.match(editor, /startScrollLeft: stage\.scrollLeft/);
  assert.match(editor, /stage\.scrollLeft = state\.pan\.startScrollLeft/);
  assert.match(editor, /stage\.scrollTop = state\.pan\.startScrollTop/);
  assert.match(editor, /action === 'move' \? 'move' : 'grab'/);
});

test('workspace outside the canvas also uses open-hand drag panning', () => {
  assert.match(page, /image-editor-stage-pan\.js/);
  assert.match(styles, /\.canvas-stage[\s\S]*cursor: grab/);
  assert.match(styles, /\.canvas-stage\.is-panning \{ cursor: grabbing/);
  assert.match(stagePan, /event\.target !== stage/);
  assert.match(stagePan, /stage\.scrollLeft = pan\.left/);
  assert.match(stagePan, /stage\.scrollTop = pan\.top/);
  assert.match(stagePan, /setPointerCapture/);
});

test('installer image browser lists only orders containing safe image uploads', () => {
  assert.match(page, />Upload Image<\/label>/);
  assert.match(page, /id="browse-installer-images"[\s\S]*>Browse Images<\/button>/);
  assert.match(page, /id="browse-images-search"[\s\S]*Search customer name, order number, or date/);
  assert.match(page, /id="browse-image-orders"[\s\S]*id="browse-order-images"/);
  assert.match(mediaBrowser, /rpc\('get_shared_media_bookings'/);
  assert.match(mediaBrowser, /p_company_id: app\.state\.companyId/);
  assert.match(mediaBrowser, /filter\(order => order\.images\.length > 0\)/);
  assert.match(mediaBrowser, /required_media[\s\S]*other_media/);
  assert.match(mediaBrowser, /IMAGE_PATTERN\.test\(url\)/);
  assert.match(mediaBrowser, /await app\.addFiles\(files\)/);
  assert.match(styles, /\.browse-images-layout/);
});
