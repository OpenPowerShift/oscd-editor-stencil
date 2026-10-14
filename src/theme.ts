import { css } from 'lit';
import { oscdMd3Mappings } from '@omicronenergy/oscd-ui/oscd-md3-mappings.js';

/**
 * Internal palette for the stencil editor, following the OpenSCD theming
 * model (`@openscd/oscd-api` docs/theming.md).
 *
 * The root component initialises internal `--oscd-*` tokens from the
 * distro-provided `--oscd-theme-*` tokens with Solarized defaults, so
 * sub-components only ever reference the internal tokens. The plugin never
 * sets `--oscd-theme-*` itself.
 *
 * The service colours are plugin hooks that follow the palette by default.
 */
export const themeStyles = [
  oscdMd3Mappings,
  css`
    :host {
      --oscd-primary: var(--oscd-theme-primary, #2aa198);
      --oscd-secondary: var(--oscd-theme-secondary, #6c71c4);
      --oscd-error: var(--oscd-theme-error, #dc322f);

      --oscd-base03: var(--oscd-theme-base03, #002b36);
      --oscd-base02: var(--oscd-theme-base02, #073642);
      --oscd-base01: var(--oscd-theme-base01, #586e75);
      --oscd-base00: var(--oscd-theme-base00, #657b83);
      --oscd-base0: var(--oscd-theme-base0, #839496);
      --oscd-base1: var(--oscd-theme-base1, #93a1a1);
      --oscd-base2: var(--oscd-theme-base2, #eee8d5);
      --oscd-base3: var(--oscd-theme-base3, #fdf6e3);

      --oscd-shape: var(--oscd-theme-shape, 8px);

      --oscd-text-font: var(--oscd-theme-text-font, 'Roboto');
      --oscd-text-font-mono: var(--oscd-theme-text-font-mono, 'Roboto Mono');
      --oscd-icon-font: var(
        --oscd-theme-icon-font,
        'Material Symbols Outlined'
      );

      --md-sys-shape-corner-none: 0;
      --md-sys-shape-corner-extra-small: calc(0.5 * var(--oscd-shape));
      --md-sys-shape-corner-small: var(--oscd-shape);
      --md-sys-shape-corner-medium: calc(1.5 * var(--oscd-shape));
      --md-sys-shape-corner-large: calc(2 * var(--oscd-shape));
      --md-icon-font: var(--oscd-icon-font);

      --stencil-goose-color: var(
        --oscd-editor-stencil-goose-color,
        var(--oscd-primary)
      );
      --stencil-sv-color: var(
        --oscd-editor-stencil-sv-color,
        var(--oscd-secondary)
      );

      font-family: var(--oscd-text-font), sans-serif;
    }
  `
];
