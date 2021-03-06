import { DEBUG } from '@glimmer/env';
import Ember from 'ember';
import { set } from '@ember/object';
import { getOwner, setOwner } from '@ember/application';
import { capabilities } from '@ember/component';
import { schedule } from '@ember/runloop';
import { gte } from 'ember-compatibility-helpers';
import BaseComponentManager, {
  ComponentManagerArgs,
  CustomComponentCapabilities,
} from './base-component-manager';

import GlimmerComponent, { DESTROYING, DESTROYED } from './component';

const CAPABILITIES = gte('3.13.0-beta.1')
  ? capabilities('3.13', {
      destructor: true,
      asyncLifecycleCallbacks: false,
      updateHook: false,
    })
  : capabilities('3.4', {
      destructor: true,
      asyncLifecycleCallbacks: false,
    });

/**
 * This component manager runs in Ember.js environments and extends the base component manager to:
 *
 * 1. Properly destroy the component's associated `meta` data structure
 * 2. Schedule destruction using Ember's runloop
 */
class EmberGlimmerComponentManager extends BaseComponentManager(setOwner, getOwner, CAPABILITIES) {
  destroyComponent(component: GlimmerComponent) {
    if (component[DESTROYING]) {
      return;
    }

    let meta = Ember.meta(component);

    meta.setSourceDestroying();
    component[DESTROYING] = true;

    schedule('actions', component, component.willDestroy);
    schedule('destroy', this, scheduledDestroyComponent, component, meta);
  }
}

function scheduledDestroyComponent(component: GlimmerComponent, meta: EmberMeta) {
  if (component.isDestroyed) {
    return;
  }

  Ember.destroy(component);

  meta.setSourceDestroyed();
  component[DESTROYED] = true;
}

interface EmberGlimmerComponentManager {
  updateComponent?: (component: GlimmerComponent, args: ComponentManagerArgs) => void;
}

// In Ember 3.12 and earlier, the updateComponent hook was mandatory.
// As of Ember 3.13, the `args` object is stable and each property of the
// object participates in the autotrack stack on its own. This means we do not
// need to set the `args` property on the component instance to invalidate
// tracked getters that rely on `args`, and therefore don't require the `updateComponent`
// hook at all.
if (!gte('3.13.0-beta.1')) {
  EmberGlimmerComponentManager.prototype.updateComponent = function updateComponent(
    component: GlimmerComponent,
    args: ComponentManagerArgs
  ) {
    let argSnapshot = args.named;

    if (DEBUG) {
      argSnapshot = Object.freeze(argSnapshot);
    }

    set(component, 'args', argSnapshot);
  };
}

export default EmberGlimmerComponentManager;

interface EmberMeta {
  setSourceDestroying(): void;
  setSourceDestroyed(): void;
}

declare module 'ember' {

  export namespace Ember {
    function destroy(obj: {}): void;
    function meta(obj: {}): EmberMeta;
  }
}

declare module '@ember/component' {
  export function capabilities(
    version: '3.13' | '3.4',
    capabilities: Partial<CustomComponentCapabilities>
  ): CustomComponentCapabilities;
}
