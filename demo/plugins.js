import OscdMenuOpen from '@omicronenergy/oscd-menu-open';
import OscdMenuSave from '@omicronenergy/oscd-menu-save';
import OscdBackgroundEditV1 from '@omicronenergy/oscd-background-editv1';

import OscdEditorStencil from '../dist/oscd-editor-stencil.js';

const oscdShell = document.querySelector('oscd-shell');
if (!oscdShell) {
  throw new Error('oscd-shell not found');
}
const registry = oscdShell.registry;
if (!registry) {
  throw new Error('oscd-shell registry not found, cannot register plugins');
}

registry.define('oscd-menu-open', OscdMenuOpen);
registry.define('oscd-menu-save', OscdMenuSave);
registry.define('oscd-background-editv1', OscdBackgroundEditV1);
registry.define('oscd-editor-stencil', OscdEditorStencil);

export const plugins = {
  menu: [
    {
      name: 'Open File',
      translations: { de: 'Datei öffnen', pt: 'Abrir ficheiro' },
      icon: 'folder_open',
      tagName: 'oscd-menu-open',
    },
    {
      name: 'Save File',
      translations: { de: 'Datei speichern', pt: 'Guardar ficheiro' },
      icon: 'save',
      requireDoc: true,
      tagName: 'oscd-menu-save',
    },
  ],
  editor: [
    {
      name: 'Stencil',
      translations: { de: 'Schablone', pt: 'Modelo' },
      icon: 'draw_collage',
      requireDoc: true,
      tagName: 'oscd-editor-stencil',
    },
    {
      name: 'Source Editor',
      translations: { de: 'Source Editor', pt: 'Editor de código' },
      icon: 'data_object',
      requireDoc: true,
      src: 'https://omicronenergyoss.github.io/oscd-editor-source/oscd-editor-source.js',
    },
  ],
  background: [
    {
      name: 'EditV1 Events Listener',
      icon: 'none',
      requireDoc: true,
      tagName: 'oscd-background-editv1',
    },
  ],
};
