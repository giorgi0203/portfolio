import { maskJavaScript, type CompilerInstruction } from './compiler-explanations';

export interface DecodedInstruction {
  arguments: { label: string; value: string; detail: string }[];
  steps: string[];
  sourceUrl: string | null;
  sourceVersion: string;
}

// These signatures, explanations and source locations follow deploy/compiler-runtime/package.json.
const sourceVersion = '21.0.6';
const render3Source = 'https://github.com/angular/angular/blob/' + sourceVersion + '/packages/core/src/render3/';
type Parameter = readonly [label: string, detail: string];

const slot: Parameter = ['View slot', 'A declaration index local to this template instance. Embedded templates have their own slots.'];
const attrs: Parameter = ['Attributes constant', 'Index into the component’s consts table for static attributes and binding metadata.'];
const refs: Parameter = ['Local references', 'Index into consts for template reference names such as #box.'];
const tag: Parameter = ['Tag name', 'The HTML or SVG element name emitted by the compiler.'];
const declarations: Parameter = ['Declaration slots', 'Space for nodes, pipes, references and other declarations in one instance of this view.'];
const bindings: Parameter = ['Binding slots', 'Space in each view instance for previous binding values and intermediate results.'];
const expression: Parameter = ['Expression', 'The generated expression that supplies the value when this view is checked.'];
const sanitizer: Parameter = ['Sanitizer', 'An optional function that makes the value safe for this binding’s security context.'];
const handler: Parameter = ['Handler', 'The callback invoked when the event arrives.'];
const templateParameters: Parameter[] = [
  slot, ['View function', 'The generated function Angular calls to create and update this embedded view.'],
  declarations, bindings, ['Root tag', 'Optional element name used for template matching and projection.'], attrs,
];
const compareBinding = 'Take the next binding slot in this view instance (LView). bindingUpdated compares the new value with the stored value using Object.is.';

interface Explanation {
  parameters: readonly Parameter[];
  steps: string[];
  file: string;
}

function explain(file: string, parameters: readonly Parameter[], ...steps: string[]): Explanation {
  return { file, parameters, steps };
}

// Split one emitted argument list, array or object at its outer commas. Use the same lexical
// mask as the instruction parser so commas in strings, regexes and callbacks stay inside values.
function parts(source: string, mask: string, open: number): string[] {
  if (open < 0) return [];
  const result: string[] = [];
  let start = open + 1;
  let depth = 1;
  for (let pos = start; pos < mask.length; pos++) {
    const char = mask[pos];
    if (char === '(' || char === '{' || char === '[') depth++;
    else if (char === ')' || char === '}' || char === ']') depth--;
    if (depth === 0 || (depth === 1 && char === ',')) {
      const part = source.slice(start, pos).trim();
      if (part) result.push(part);
      if (depth === 0) return result;
      start = pos + 1;
    }
  }
  return [];
}

function fields(source: string, mask: string, open: number): Map<string, string> {
  const result = new Map<string, string>();
  for (const member of parts(source, mask, open)) {
    const field = /^(\w+)\s*:\s*([\s\S]+)/.exec(member);
    if (field) result.set(field[1], field[2]);
  }
  return result;
}

function constantsInFile(code: string): string[] {
  const mask = maskJavaScript(code);
  const definitions = Array.from(mask.matchAll(/ɵɵdefineComponent\s*\(\s*\{/g));
  // Several components can have different consts[0]. In that case show the index alone.
  if (definitions.length !== 1) return [];
  const definition = definitions[0];
  const open = (definition.index ?? 0) + definition[0].lastIndexOf('{');
  const table = fields(code, mask, open).get('consts');
  return table?.startsWith('[') ? parts(table, maskJavaScript(table), 0) : [];
}

function excerpt(value: string): string {
  return value.length > 190 ? value.slice(0, 189) + '…' : value;
}

function explanationFor(name: string, count: number): Explanation | null {
  const interpolation = /^(textInterpolate|interpolate)([1-8V]?)$/.exec(name);
  if (interpolation) {
    const text = interpolation[1] === 'textInterpolate';
    const variant = interpolation[2];
    const parameters: Parameter[] = Array.from({ length: count }, (_, index) => {
      if (variant === 'V') return ['Interpolation parts', 'An array alternating literal text and dynamic expressions.'];
      if (!variant || index % 2 === 1) return ['Expression ' + (variant ? (index + 1) / 2 : 1), expression[1]];
      const literal = index === 0 ? 'Prefix' : index === 2 * Number(variant) ? 'Suffix' : 'Separator';
      return [literal, 'Static text included when Angular builds the string.'];
    });
    return explain(text ? 'instructions/text_interpolation.ts' : 'instructions/value_interpolation.ts', parameters,
      'Evaluate the dynamic expressions and compare each with its previous value in this view’s binding slots.',
      'If all are unchanged, the interpolation returns Angular’s NO_CHANGE marker.',
      text ? 'For a changed result, textBindingInternal writes the assembled string to the selected text node.'
        : 'For a changed result, return the assembled string to the enclosing binding instruction.');
  }

  if (/^(?:domElement|element)(?:Start)?$/.test(name)) {
    const domOnly = name.startsWith('dom');
    return explain('instructions/element.ts', [slot, tag, attrs, refs],
      'On the first creation pass Angular records shared node metadata in the template’s TView. Later instances reuse it.',
      domOnly ? 'Locate or create the native element and store it in the instance’s LView slot.' :
        'Locate or create the element, store it in the instance’s LView and initialize matching directives or components.',
      name.endsWith('Start') ? 'Use the element as the parent for the child nodes that follow.' : 'Finish this element immediately so the next node can be its sibling.');
  }

  if (/^pipeBind[1-4V]$/.test(name)) {
    const input: Parameter = name.endsWith('V') ? ['Pipe inputs', 'Array of values passed to transform.'] : ['Pipe input', 'One value passed to transform.'];
    return explain('pipe.ts', [slot, ['Cache offset', 'Offset from the binding root for this pipe call’s cached inputs and result.'], ...Array<Parameter>(Math.max(count - 2, 0)).fill(input)],
      'Look up the pipe instance at the declaration index.',
      'For a pure pipe, compare the inputs with the saved inputs and reuse the result if they match. An impure pipe calls transform on each check.');
  }

  const pureFunction = /^pureFunction([0-8V])$/.exec(name);
  if (pureFunction) {
    const inputs: Parameter[] = pureFunction[1] === 'V'
      ? [['Inputs', 'An array of values to compare with the saved inputs.']]
      : Array.from({ length: Number(pureFunction[1]) }, (_, i) => ['Input ' + (i + 1), expression[1]]);
    return explain('pure_function.ts', [
      ['Cache offset', 'Offset from the binding root to this call’s saved inputs and result.'],
      ['Pure function', 'Compiler-generated function, often used to build an array or object.'],
      ...inputs, ['Receiver', 'Optional value for this inside the function.'],
    ], inputs.length ? 'Compare the inputs in this instance’s binding slots. Call the function when they change and cache its result.' :
      'Call the function once for this view instance and cache its result.',
    'Return the cached result for reuse across checks, preserving object identity when the inputs stay the same.');
  }

  if (/^(?:domElement|element)Container(?:Start|End)?$/.test(name)) {
    if (name.endsWith('End')) return explain('instructions/element_container.ts', [], 'End the logical group so later nodes belong to its enclosing creation scope.');
    return explain('instructions/element_container.ts', [slot, attrs, refs],
      'Create a logical group for ng-container. Angular uses a comment anchor so the group needs no HTML wrapper.',
      name.endsWith('Start') ? 'Create subsequent children in the group’s scope.' : 'Close the group immediately.');
  }

  switch (name) {
    case 'domElementEnd':
    case 'elementEnd':
      return explain('instructions/element.ts', [],
        'Finish the current element’s children and restore its enclosing creation scope.');
    case 'text':
      return explain('instructions/text.ts', [slot, ['Initial text', 'The literal content. An omitted value starts as an empty string.']],
        'Locate or create a text node in the current parent.', 'Keep the node in the specified LView slot so an update can select it later.');
    case 'advance':
      return explain('instructions/advance.ts', [['Distance', 'How many declaration slots to move forward from the currently selected slot.']],
        'Read the selected index and add the distance. An omitted distance defaults to 1.',
        'selectIndexInternal selects that slot for later operations, running pending pre-order hooks as appropriate.');
    case 'domListener':
    case 'listener':
    case 'twoWayListener':
      return explain(name === 'twoWayListener' ? 'instructions/two_way.ts' : 'instructions/listener.ts',
        [['Event name', 'The name watched on the current node.'], handler, ['Event target', 'Optional resolver for a global target such as window.']],
        name === 'domListener' ? 'Wrap the handler and register it with the DOM event listener machinery.' :
          'Register the wrapped callback for applicable DOM events and directive outputs.',
        'When the event is delivered, the wrapper marks the view dirty and calls the generated handler with the event.');
    case 'domProperty':
    case 'property':
    case 'twoWayProperty':
      return explain(name === 'domProperty' ? 'instructions/dom_property.ts' : name === 'twoWayProperty' ? 'instructions/two_way.ts' : 'instructions/property.ts',
        [['Property name', 'The generated binding target name.'], expression, sanitizer],
        ...(name === 'twoWayProperty' ? ['Read the current value if the binding is a writable signal.'] : []),
        compareBinding,
        name === 'domProperty' ? 'If the binding changed, setDomProperty writes the native property on the selected element.' :
          'If the binding changed, setPropertyAndInputs writes matching directive inputs or falls back to the element property.');
    case 'attribute':
      return explain('instructions/attribute.ts', [['Attribute name', 'The attribute on the selected element.'], expression, sanitizer, ['Namespace', 'Optional namespace for this attribute.']],
        compareBinding, 'On change, remove the attribute for a null or undefined value. Otherwise write the sanitized or stringified value.');
    case 'twoWayBindingSet':
      return explain('instructions/two_way.ts', [['Target', 'The current two-way binding target.'], ['Incoming value', 'The new value from the control.']],
        'Check whether the target is a writable signal. If so, call its set method and return true.',
        'For other targets, return false so the compiled listener can perform its assignment fallback.');
    case 'conditionalCreate':
    case 'conditionalBranchCreate':
    case 'template':
    case 'domTemplate':
      return explain(name.includes('conditional') ? 'instructions/control_flow.ts' : 'instructions/template.ts',
        [...templateParameters, refs, ['Reference extractor', 'Function used to resolve a local template reference.']],
        'Register the template function and its slot counts. Each instance gets its own view state.',
        'Create a container at the declaration slot. An embedded view can later be inserted at that position.');
    case 'conditional':
      return explain('instructions/control_flow.ts', [['Branch slot', 'The chosen template’s declaration index. The value -1 means no active branch.'], ['Branch context', 'An optional value supplied to the embedded view.']],
        'Compare the chosen template index with the one saved in this view’s binding slot.',
        'If the branch changed, remove the previous view and render the selected one when its index is nonnegative.',
        'If the branch stayed active, reuse the view and refresh its context.');
    case 'repeaterCreate':
      return explain('instructions/control_flow.ts', [
        ['Repeater slot', 'Index for the loop metadata. The item template lives in the next slot.'],
        ...templateParameters.slice(1),
        ['Tracking function', 'Computes the key Angular uses to match collection items to existing views.'],
        ['Bind component', 'Whether tracking needs the component instance as its receiver.'],
        ['Empty view', 'Optional template function for @empty.'], ['Empty declarations', declarations[1]], ['Empty bindings', bindings[1]],
        ['Empty root tag', 'Root element name for the empty template.'], ['Empty attributes', attrs[1]],
      ], 'Save the tracking function and whether the loop declares an empty state.',
      'Declare the item template at index + 1 and the optional empty template at index + 2.');
    case 'repeater':
      return explain('instructions/control_flow.ts', [['Collection', 'The iterable whose items should appear in this loop.']],
        'Read the loop metadata from the selected slot and call reconcile with the collection and its tracking function.',
        'Match tracked items to existing views. Reuse, move, create or remove views as needed, then refresh item indexes and the optional empty state.');
    case 'classProp':
    case 'styleProp':
    case 'classMap':
    case 'styleMap': {
      const isClass = name.startsWith('class');
      const params: Parameter[] = name.endsWith('Map') ? [expression] :
        [[isClass ? 'Class name' : 'Style property', 'The individual styling target.'], expression];
      if (name === 'styleProp') params.push(['Unit', 'Optional suffix such as px appended to the style value.']);
      return explain('instructions/styling.ts', params, 'Compare the binding with the styling values stored for the current view.',
        'Resolve precedence among applicable styling bindings and apply the resulting change to the element’s classes or styles.');
    }
    case 'nextContext':
      return explain('instructions/next_context.ts', [['Levels', 'Number of enclosing declaration views to traverse. Defaults to 1.']],
        'Walk up the requested number of declaration views and return the enclosing context so the template can read it.');
    case 'reference':
      return explain('instructions/storage.ts', [['Reference slot', 'Declaration index of a saved template reference such as #draft.']],
        'Read that slot in the current context view. The reference may point to a DOM element, directive, or template.');
    case 'pipe':
      return explain('pipe.ts', [slot, ['Pipe name', 'The name after the pipe operator in a template expression.']],
        'Look up the pipe definition by name, create a pipe instance and store it in this view’s slot.',
        'Later pipeBind instructions use that instance to transform the binding inputs.');
    case 'getCurrentView':
      return explain('instructions/get_current_view.ts', [], 'Capture the current view handle so an event callback can access its template context later.');
    case 'restoreView':
      return explain('state.ts', [['Saved view', 'The captured view handle.']], 'Set the active context view to the saved instance and return its context.');
    case 'resetView':
      return explain('state.ts', [['Return value', 'Optional result from the listener.']], 'Clear the restored context view and pass the result back to the caller.');
    case 'setClassMetadata':
      return explain('metadata.ts', [['Class', 'The decorated type.'], ['Decorators', 'Metadata for class decorators.'],
        ['Constructor', 'An optional function describing constructor parameters.'], ['Members', 'Metadata for decorated class members.']],
        'Attach the emitted decorator information to the class for runtime reflection and development tooling.');
    case 'setClassDebugInfo':
      return explain('debug/set_debug_info.ts', [['Component', 'The component class.'], ['Debug info', 'Identifying information such as source file and line.']],
        'Read the component definition and attach its debug info so tools can identify the component.');
    case 'defineDirective':
      return explain('definition.ts', [['Definition', 'The emitted directive metadata object.']],
        'Build the directive definition (ɵdir) with its selectors, inputs, outputs and host behavior, then initialize its features.');
    case 'defineComponent':
      return explain('definition.ts', [['Definition', 'The emitted component metadata object.']], 'Build the reusable component definition (ɵcmp) from the emitted settings.',
        'The template function receives render flags (rf) and the component context (ctx). The creation and update blocks use the declared slots.');
    default:
      return null;
  }
}

// Function declarations in the Angular tag above. Links open at the selected method.
const declarationLines: Record<string, number> = {
  pureFunction0: 51, pureFunction1: 71, pureFunction2: 93, pureFunction3: 125, pureFunction4: 160,
  pureFunction5: 198, pureFunction6: 239, pureFunction7: 282, pureFunction8: 327, pureFunctionV: 369,
  elementContainerStart: 60, elementContainerEnd: 104, elementContainer: 129,
  domElementContainerStart: 150, domElementContainerEnd: 186, domElementContainer: 205,
  reference: 22, pipe: 41, setClassMetadata: 72, setClassDebugInfo: 18, defineDirective: 570,
  advance: 43, attribute: 26, conditionalCreate: 73, conditionalBranchCreate: 121,
  conditional: 162, repeaterCreate: 289, repeater: 480, template: 266, domTemplate: 310,
  elementStart: 78, elementEnd: 128, element: 179,
  domElementStart: 201, domElementEnd: 243, domElement: 270, text: 35,
  domProperty: 33, property: 38, twoWayProperty: 33, twoWayBindingSet: 63, twoWayListener: 77,
  listener: 33, domListener: 97, styleProp: 77, classProp: 101, styleMap: 128, classMap: 165,
  defineComponent: 340, nextContext: 22, getCurrentView: 20, restoreView: 363, resetView: 374,
  pipeBind1: 171, pipeBind2: 200, pipeBind3: 231, pipeBind4: 264, pipeBindV: 302,
  textInterpolate: 48, textInterpolate1: 72, textInterpolate2: 104, textInterpolate3: 139,
  textInterpolate4: 176, textInterpolate5: 215, textInterpolate6: 258, textInterpolate7: 316,
  textInterpolate8: 378, textInterpolateV: 448,
  interpolate: 32, interpolate1: 47, interpolate2: 62, interpolate3: 85, interpolate4: 112,
  interpolate5: 143, interpolate6: 178, interpolate7: 217, interpolate8: 277, interpolateV: 327,
};

const componentFields: Record<string, Parameter> = {
  selectors: ['selectors', 'Element, attribute or class selectors for this component.'],
  decls: ['decls', declarations[1]],
  vars: ['vars', bindings[1]],
  consts: ['consts', 'Shared constants used by template instructions, indexed from zero.'],
};

export function decodeInstruction(instruction: CompilerInstruction, generatedCode: string): DecodedInstruction {
  const name = instruction.name.replace(/^ɵɵ?/, '');
  const mask = maskJavaScript(instruction.raw);
  const values = parts(instruction.raw, mask, mask.indexOf('('));
  const info = explanationFor(name, values.length);
  let constantTable: string[] | undefined;
  const args = values.map((value, index) => {
    const parameter = info?.parameters[index];
    const label = parameter?.[0] ?? 'Argument ' + (index + 1);
    let detail = parameter?.[1] ?? 'Expression as emitted by the compiler.';
    if ((parameter === attrs || parameter === refs) && value === 'null') detail = 'No constant is supplied for this parameter.';
    if ((parameter === attrs || parameter === refs) && /^\d+$/.test(value)) {
      constantTable ??= constantsInFile(generatedCode);
      const entry = constantTable[Number(value)];
      if (entry) detail += ' consts[' + value + '] = ' + excerpt(entry);
    }
    return { label, value: excerpt(value), detail };
  });
  if (!args.length && (name === 'advance' || name === 'nextContext') && info) {
    const [label, detail] = info.parameters[0];
    args.push({ label, value: '1 (default)', detail });
  }
  if (name === 'defineComponent' && values[0]?.startsWith('{')) {
    const metadata = fields(values[0], maskJavaScript(values[0]), 0);
    for (const [field, [label, detail]] of Object.entries(componentFields)) {
      const value = metadata.get(field);
      if (value !== undefined) args.push({ label, value: excerpt(value), detail });
    }
    if (args.length > 1) args.shift(); // Prefer individual fields to a truncated copy of the object.
  }
  return {
    arguments: args,
    steps: info?.steps ?? ['Read this helper and its arguments in the generated file. A step-by-step description is unavailable for this Angular instruction.'],
    sourceUrl: info ? render3Source + info.file + (declarationLines[name] ? '#L' + declarationLines[name] : '') : null,
    sourceVersion,
  };
}
