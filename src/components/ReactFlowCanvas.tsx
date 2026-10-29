import { Children, cloneElement, isValidElement, memo, useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { BaseEdge, ConnectionMode, getBezierPath, Handle, Position, ReactFlow, SelectionMode, useUpdateNodeInternals, type Connection, type ConnectionLineComponentProps, type Edge, type EdgeChange, type EdgeProps, type Node, type NodeChange, type NodeProps } from '@xyflow/react';
import { boundsOf, type CanvasImage, type Viewport } from '../canvas';
import { canConnectCanvasNodes, canvasConnectionSides, type CanvasConnection, type CanvasConnectionInput, type CanvasConnectionNode, type CanvasConnectionNodes } from '../canvas-connections';
import { magneticDragDelta, type DragSnapContext, type SnapGuides } from '../canvas-snapping';
import { ImageConnection } from './ImageConnection';
import { flowNodeGeometry } from '../react-flow-geometry';
import type { Locale } from '../i18n';
import { CanvasConnectionHandle, type AddConnectionMedia } from './CanvasConnectionHandle';
import './react-flow-canvas.css';

type ContentProps = { children?: ReactNode; style?: CSSProperties; className?: string; 'data-canvas-id'?: string; 'data-fusion-id'?: string; image?: CanvasImage; target?: CanvasImage; active?: boolean; zoom?: number };
type ContentNode = Node<{ content: ReactElement<ContentProps>; connectionNode?: CanvasConnectionNode; freeConnections: boolean; connectable: boolean; zoom: number; locale?: Locale; onAddConnectionMedia?: AddConnectionMedia; reconnectHandle?: string | null; reconnectHovered?: boolean }, 'lightchain'>;
type ConnectionEdge = Edge<{ image: CanvasImage; target: CanvasImage; active: boolean; zoom: number; freeConnections: boolean }, 'lightchain'>;
type FreeConnectionEdge = Edge<{ zoom: number; active: boolean }, 'lightchain-free'>;
type CanvasEdge = ConnectionEdge | FreeConnectionEdge;
const handles = [Position.Left, Position.Right];
const freeHandles = [Position.Left, Position.Right];
const LightchainNode = memo(({ id, data }: NodeProps<ContentNode>) => {
  const updateNodeInternals = useUpdateNodeInternals();
  useLayoutEffect(() => {
    // Keep DOM measurements in sync with the same declared handle geometry.
    // Controlled updates can render edges immediately, before this refresh.
    if (data.freeConnections) updateNodeInternals(id);
  }, [id, data.freeConnections, data.connectionNode?.kind, data.zoom, updateNodeInternals]);
  return <>
    {!data.freeConnections && handles.flatMap(side => ['source', 'target'].map(type => <Handle key={`${type}-${side}`} id={`${type}-${side}`} type={type as 'source' | 'target'} position={side} isConnectable={false} className="lc-flow-handle" />))}
    {data.content}
    {data.freeConnections && canvasConnectionSides(data.connectionNode).map(side => <CanvasConnectionHandle key={`free-${side}`}
      nodeId={id} side={side} node={data.connectionNode} connectable={data.connectable} locale={data.locale} onAdd={data.onAddConnectionMedia}
      reconnectable={data.reconnectHandle === `free-${side}`} reconnectHovered={data.reconnectHandle === `free-${side}` && data.reconnectHovered} />)}
  </>;
});
// Automatic and free lines share the same ink and animation. Only the free
// line has an interaction path; raised ink leaves the actual port circles clear.
function ConnectionStroke({ path, active, zoom, ports, interactive = false }: {
  path: string; active: boolean; zoom: number; interactive?: boolean;
  ports?: { sourceX: number; sourceY: number; targetX: number; targetY: number };
}) {
  const maskId = useId();
  const padding = ports ? Math.abs(ports.targetX - ports.sourceX) + Math.abs(ports.targetY - ports.sourceY) + 256 + 32 / zoom : 0;
  const bounds = ports ? { x: Math.min(ports.sourceX, ports.targetX) - padding, y: Math.min(ports.sourceY, ports.targetY) - padding,
    width: Math.abs(ports.targetX - ports.sourceX) + 2 * padding, height: Math.abs(ports.targetY - ports.sourceY) + 2 * padding } : undefined;
  return <g className="lc-flow-connection" data-active={active} style={{ '--canvas-inverse-scale': 1 / zoom } as CSSProperties}>
    {ports && active && <defs><mask id={maskId} maskUnits="userSpaceOnUse" {...bounds}>
      <rect {...bounds} fill="white" />
      <circle cx={ports.sourceX} cy={ports.sourceY} r={10 / zoom} fill="black" />
      <circle cx={ports.targetX} cy={ports.targetY} r={10 / zoom} fill="black" />
    </mask></defs>}
    <g mask={ports && active ? `url(#${maskId})` : undefined}>
      {active && <path d={path} className="lc-flow-edge-underlay" />}
      {interactive ? <BaseEdge path={path} className="lc-flow-edge-line" interactionWidth={20 / zoom} /> : <path d={path} className="lc-flow-edge-line" />}
    </g>
  </g>;
}
const LightchainEdge = memo((props: EdgeProps<ConnectionEdge>) => {
  const { data } = props;
  if (!data) return null;
  const { image, target, active, zoom } = data;
  const right = target.x + target.width / 2 >= image.x + image.width / 2;
  const direction = right ? 1 : -1, gap = (active ? 4 : 2) / zoom;
  const sx = image.x + (right ? image.width : 0) + gap * direction, sy = image.y + image.height / 2;
  const tx = target.x + (right ? 0 : target.width) - gap * direction, ty = target.y + target.height / 2;
  const handle = Math.max(48, Math.abs(tx - sx) * .45);
  // The video workspace always binds material output on the right to editor
  // input on the left. Fusion retains its position-dependent business lines.
  const d = data.freeConnections ? getBezierPath(props)[0]
    : `M ${sx} ${sy} C ${sx + handle * direction} ${sy}, ${tx - handle * direction} ${ty}, ${tx} ${ty}`;
  // React Flow scales an HTML viewport around the SVG. Compensate explicitly
  // for that scale instead of relying on SVG-only non-scaling-stroke behavior.
  return <ConnectionStroke path={d} active={active} zoom={zoom} ports={data.freeConnections ? props : undefined} />;
});
const LightchainFreeEdge = memo((props: EdgeProps<FreeConnectionEdge>) => {
  const [path] = getBezierPath(props);
  const zoom = props.data?.zoom ?? 1;
  return <ConnectionStroke path={path} active={!!props.data?.active} zoom={zoom} ports={props} interactive />;
});
const LightchainConnectionLine = (props: ConnectionLineComponentProps<ContentNode>) => {
  const [path] = getBezierPath({ sourceX: props.fromX, sourceY: props.fromY, sourcePosition: props.fromPosition,
    targetX: props.toX, targetY: props.toY, targetPosition: props.toPosition });
  return <g className="lc-flow-connection lc-flow-draft-connection" data-active="true" data-invalid={props.connectionStatus === 'invalid'}>
    <path d={path} className="lc-flow-edge-underlay" /><path d={path} className="lc-flow-edge-line" />
  </g>;
};
const nodeTypes = { lightchain: LightchainNode };
const edgeTypes = { lightchain: LightchainEdge, 'lightchain-free': LightchainFreeEdge };
const controlSelector = 'button,input,textarea,select,[contenteditable="true"],[data-select-popup]';
function reconnectTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const updater = target.closest('.react-flow__edgeupdater');
  const edgeId = updater?.closest('.lc-flow-free-edge')?.getAttribute('data-id');
  if (!updater || !edgeId) return null;
  return { edgeId, end: updater.classList.contains('react-flow__edgeupdater-source') ? 'source' as const : 'target' as const };
}

type Props = {
  children: ReactNode; view: Viewport; selectedIds: string[]; hand: boolean; referenceMode: boolean; snap: boolean;
  spacePanControlled?: boolean;
  onView: (view: Viewport) => void; onSelection: (ids: string[]) => void;
  onPositions: (positions: Map<string, { x: number; y: number }>) => void;
  onSelecting: (active: boolean) => void; onDragStart: () => void; onDragEnd: () => void; onGuides: (guides: SnapGuides | null) => void;
  onPrepareCopyDrag?: (ids: string[]) => { ids: string[]; commit: (offset: { x: number; y: number }) => void } | null;
  connections?: CanvasConnection[]; selectedConnectionIds?: string[];
  connectionNodes?: CanvasConnectionNodes;
  locale?: Locale;
  onAddConnectionMedia?: AddConnectionMedia;
  validateConnection?: (connection: CanvasConnectionInput, replacingId?: string) => boolean;
  onConnect?: (connection: CanvasConnectionInput) => void;
  onReconnect?: (id: string, connection: CanvasConnectionInput) => void;
  onConnectionSelection?: (ids: string[]) => void;
};

// Adapts the existing product components/data to real React Flow nodes and edges.
// Business operations and their history continue to use the shared canvas model.
export function ReactFlowCanvas(props: Props) {
  const latest = useRef(props); latest.current = props;
  const selectionRef = useRef(props.selectedIds); selectionRef.current = props.selectedIds;
  const connectionSelectionRef = useRef(props.selectedConnectionIds ?? []); connectionSelectionRef.current = props.selectedConnectionIds ?? [];
  const [connecting, setConnecting] = useState(false);
  const [reconnectHover, setReconnectHover] = useState<{ edgeId: string; end: 'source' | 'target' } | null>(null);
  const reconnectClick = useRef<{ nodeId: string; handleId: string; dragged: boolean } | null>(null);
  const reconnectingId = useRef<string | null>(null);
  const freeConnections = !!props.onConnect;
  const connectable = freeConnections && !props.hand && !props.referenceMode;
  const shiftClick = useRef(false);
  const setSelection = useCallback((ids: string[]) => {
    // React Flow can emit several changes before the controlled props render.
    selectionRef.current = ids;
    latest.current.onSelection(ids);
  }, []);
  const setConnectionSelection = useCallback((ids: string[]) => {
    connectionSelectionRef.current = ids;
    latest.current.onConnectionSelection?.(ids);
  }, []);
  const drag = useRef<{ anchor: string; start: Map<string, {x: number; y: number}>; snap: DragSnapContext } | null>(null);
  const bypass = useRef(false);
  const copyGesture = useRef<{ pointer: number; x: number; y: number; zoom: number; root: HTMLDivElement; nodes: ContentNode[];
    offset: { x: number; y: number }; moved: boolean; commit: (offset: { x: number; y: number }) => void } | null>(null);
  const [copyPreview, setCopyPreview] = useState<{ nodes: ContentNode[]; offset: { x: number; y: number } } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const copyModifier = useRef(false);
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);
  const [copyHint, setCopyHint] = useState(false);
  const updateCopyHint = useCallback(() => {
    // Keep the latched copy gesture visible even if Alt is released mid-drag.
    if (copyGesture.current) { setCopyHint(true); return; }
    const p = latest.current, point = hoverPoint.current, root = rootRef.current;
    if (!copyModifier.current || !point || !root || p.hand || p.referenceMode || !p.onPrepareCopyDrag || drag.current
      || document.activeElement?.closest('input,textarea,select,[contenteditable="true"]')) {
      setCopyHint(false); return;
    }
    // Hit-test on modifier changes too: the pointer need not move after Alt.
    const target = document.elementFromPoint(point.x, point.y);
    const node = target?.closest<HTMLElement>('.react-flow__node');
    const id = node?.getAttribute('data-id');
    setCopyHint(!!target && !!node && root.contains(target) && !!id && selectionRef.current.includes(id)
      && !target.closest(`${controlSelector},.nodrag,.react-flow__handle,.react-flow__edgeupdater`)
      && !node.querySelector('.canvas-generation-placeholder'));
  }, []);
  const copyClick = useRef(false);
  const finishCopyDrag = useCallback((commit: boolean) => {
    const gesture = copyGesture.current;
    if (!gesture) return;
    copyGesture.current = null; setCopyPreview(null);
    latest.current.onSelecting(false); latest.current.onGuides(null);
    if (gesture.root.hasPointerCapture(gesture.pointer)) gesture.root.releasePointerCapture(gesture.pointer);
    if (commit && gesture.moved) gesture.commit(gesture.offset);
    updateCopyHint();
  }, [updateCopyHint]);
  useLayoutEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      copyModifier.current = event.altKey || event.key === 'Alt';
      updateCopyHint();
      if (!copyGesture.current) return;
      if (event.key === 'Alt') return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') finishCopyDrag(false);
    };
    const keyup = (event: KeyboardEvent) => {
      copyModifier.current = event.key !== 'Alt' && event.altKey;
      updateCopyHint();
    };
    const cancel = () => {
      copyModifier.current = false; hoverPoint.current = null;
      finishCopyDrag(false); setCopyHint(false);
    };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', keydown, true); window.addEventListener('keyup', keyup, true); window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true); window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility); cancel();
    };
  }, [finishCopyDrag, updateCopyHint]);
  useLayoutEffect(() => { if (props.hand || props.referenceMode) finishCopyDrag(false); }, [props.hand, props.referenceMode, finishCopyDrag]);
  useLayoutEffect(updateCopyHint, [props.selectedIds, props.children, props.hand, props.referenceMode, updateCopyHint]);
  const graph = useMemo(() => {
    const nodes: ContentNode[] = [], edges: CanvasEdge[] = [];
    // A shared port may belong to several lines. Reconnect only the most
    // recently selected line, while keeping all selected lines highlighted.
    const selectedEdges = props.selectedConnectionIds ?? [];
    const reconnectEdge = connectable && props.onReconnect ? props.connections?.find(edge => edge.id === selectedEdges[selectedEdges.length - 1]) : undefined;
    const visit = (children: ReactNode) => Children.forEach(children, child => {
      if (!isValidElement<ContentProps>(child)) return;
      const p = child.props;
      if (child.type === ImageConnection && p.image && p.target) {
        const right = p.target.x + p.target.width / 2 >= p.image.x + p.image.width / 2;
        edges.push({ id: `${p.image.id}->${p.target.id}`, source: p.image.id, target: p.target.id, type: 'lightchain',
          sourceHandle: freeConnections ? 'free-right' : `source-${right ? 'right' : 'left'}`,
          targetHandle: freeConnections ? 'free-left' : `target-${right ? 'left' : 'right'}`,
          selectable: false, focusable: false, reconnectable: false, zIndex: p.active ? 4 : -1,
          data: { image: p.image, target: p.target, active: !!p.active, zoom: props.view.zoom, freeConnections } });
      } else if (p['data-canvas-id'] || p['data-fusion-id']) {
        const id = p['data-canvas-id'] ?? `${p['data-fusion-id']}:fusion`;
        const style = p.style ?? {};
        const connectionNode = props.connectionNodes?.[id];
        nodes.push({ id, type: 'lightchain', position: { x: Number(style.left), y: Number(style.top) },
          ...flowNodeGeometry(Number(style.width) || 280, Number(style.height) || 400,
            freeConnections ? { sides: canvasConnectionSides(connectionNode), zoom: props.view.zoom } : undefined),
          selected: props.selectedIds.includes(id), zIndex: Number(style.zIndex) || 1,
          data: { content: cloneElement(child, { style: { ...style, left: 0, top: 0, position: 'relative', zIndex: undefined } }),
            connectionNode, freeConnections, connectable, zoom: props.view.zoom, locale: props.locale, onAddConnectionMedia: props.onAddConnectionMedia,
            reconnectHandle: reconnectEdge?.source === id ? reconnectEdge.sourceHandle ?? 'free-right' : reconnectEdge?.target === id ? reconnectEdge.targetHandle ?? 'free-left' : undefined,
            reconnectHovered: !!reconnectEdge && reconnectHover?.edgeId === reconnectEdge.id && reconnectEdge[reconnectHover.end] === id } });
      } else visit(p.children);
    });
    visit(props.children);
    if (freeConnections) {
      const nodeIds = new Set(nodes.map(node => node.id));
      for (const connection of props.connections ?? []) {
        if (!nodeIds.has(connection.source) || !nodeIds.has(connection.target)) continue;
        const selected = !!props.selectedConnectionIds?.includes(connection.id);
        const active = selected || props.selectedIds.includes(connection.source) || props.selectedIds.includes(connection.target);
        edges.push({ ...connection, sourceHandle: connection.sourceHandle ?? 'free-right', targetHandle: connection.targetHandle ?? 'free-left',
          type: 'lightchain-free', className: 'lc-flow-free-edge', selected, selectable: connectable, focusable: false,
          reconnectable: reconnectEdge?.id === connection.id, zIndex: active ? 4 : -1, data: { zoom: props.view.zoom, active } });
      }
    }
    return { nodes, edges };
  }, [props.children, props.selectedIds, props.view.zoom, props.connections, props.connectionNodes, props.selectedConnectionIds, props.onReconnect, props.locale, props.onAddConnectionMedia, freeConnections, connectable, reconnectHover]);
  const graphRef = useRef(graph); graphRef.current = graph;
  const isValidConnection = useCallback((connection: Connection | CanvasEdge) => {
    const p = latest.current;
    if (!p.onConnect || p.hand || p.referenceMode || connection.source === connection.target) return false;
    const validHandle = (id: string | null | undefined) => !!id && freeHandles.some(side => id === `free-${side}`);
    if (!validHandle(connection.sourceHandle) || !validHandle(connection.targetHandle)) return false;
    const nodes = graphRef.current.nodes;
    if (!nodes.some(node => node.id === connection.source) || !nodes.some(node => node.id === connection.target)) return false;
    if (p.connectionNodes && !canConnectCanvasNodes({ source: connection.source, target: connection.target,
      sourceHandle: connection.sourceHandle ?? null, targetHandle: connection.targetHandle ?? null }, p.connectionNodes)) return false;
    if (p.validateConnection && !p.validateConnection({ source: connection.source, target: connection.target,
      sourceHandle: connection.sourceHandle ?? null, targetHandle: connection.targetHandle ?? null }, reconnectingId.current ?? undefined)) return false;
    return !graphRef.current.edges.some(edge => edge.id !== reconnectingId.current && edge.source === connection.source && edge.target === connection.target);
  }, []);
  const onEdgeChanges = useCallback((changes: EdgeChange<CanvasEdge>[]) => {
    const p = latest.current;
    if (!p.onConnect || p.hand || p.referenceMode) return;
    const selection = changes.filter(change => change.type === 'select');
    if (!selection.length) return;
    const ids = new Set(connectionSelectionRef.current);
    for (const change of selection) {
      if (!p.connections?.some(connection => connection.id === change.id)) continue;
      change.selected ? ids.add(change.id) : ids.delete(change.id);
    }
    setConnectionSelection([...ids]);
  }, [setConnectionSelection]);
  const onChanges = useCallback((changes: NodeChange<ContentNode>[]) => {
    if (copyGesture.current) return;
    const p = latest.current;
    if (!p.referenceMode) {
      const selection = changes.filter(change => change.type === 'select');
      if (selection.length) {
        const ids = new Set(selectionRef.current);
        for (const change of selection) change.selected ? ids.add(change.id) : ids.delete(change.id);
        setSelection([...ids]);
      }
    }
    const positions = new Map<string, {x: number; y: number}>();
    for (const change of changes) if (change.type === 'position' && change.position) positions.set(change.id, change.position);
    const g = drag.current, anchor = g && positions.get(g.anchor), start = g && g.start.get(g.anchor);
    if (g && anchor && start) {
      const delta = magneticDragDelta(g.snap, (anchor.x - start.x) * p.view.zoom, (anchor.y - start.y) * p.view.zoom, p.view.zoom, p.snap && !bypass.current);
      p.onGuides(delta.guides);
      for (const [id, initial] of g.start) positions.set(id, { x: initial.x + delta.x, y: initial.y + delta.y });
    }
    if (positions.size) p.onPositions(positions);
  }, [setSelection]);
  const beginDrag = useCallback((event: MouseEvent | TouchEvent | React.MouseEvent, node: ContentNode, selected?: ContentNode[]) => {
    bypass.current = event.altKey;
    const all = graphRef.current.nodes.map(n => ({ id: n.id, ...n.position, width: n.width ?? 280, height: n.height ?? 400 })) as CanvasImage[];
    const moving = new Set((selected?.length ? selected : [node]).map(n => n.id)); moving.add(node.id);
    const anchor = all.find(n => n.id === node.id)!;
    const bounds = boundsOf(all.filter(n => moving.has(n.id)))!;
    drag.current = { anchor: node.id, start: new Map(all.filter(n => moving.has(n.id)).map(n => [n.id, { x: n.x, y: n.y }])), snap: { anchor, bounds, targets: all.filter(n => !moving.has(n.id)), locks: {} } };
    updateCopyHint();
    latest.current.onDragStart();
  }, [updateCopyHint]);
  const endDrag = useCallback(() => { drag.current = null; latest.current.onGuides(null); latest.current.onDragEnd(); updateCopyHint(); }, [updateCopyHint]);
  const onViewport = useCallback((v: Viewport) => {
    const current = latest.current.view;
    // Controlled viewport updates also emit this event. Only user/store changes
    // feed back into App, so its preset-zoom animation is not cancelled by echo.
    if (v.x !== current.x || v.y !== current.y || v.zoom !== current.zoom) latest.current.onView(v);
  }, []);
  const moveCopyDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = copyGesture.current;
    if (!gesture || gesture.pointer !== event.pointerId) return false;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 3) return true;
    if (!gesture.moved) latest.current.onSelecting(true);
    gesture.moved = true; gesture.offset = { x: dx / gesture.zoom, y: dy / gesture.zoom };
    setCopyPreview({ nodes: gesture.nodes, offset: gesture.offset });
    return true;
  };
  return <div ref={rootRef} className="lc-react-flow" data-copy-drag={!!copyPreview} data-copy-hint={copyHint} data-hand={props.hand} data-free-connections={freeConnections} data-connectable={connectable} data-connecting={connecting} style={{ '--canvas-inverse-scale': 1 / props.view.zoom } as CSSProperties}
    onPointerEnter={e => {
      hoverPoint.current = { x: e.clientX, y: e.clientY }; copyModifier.current = e.altKey; updateCopyHint();
    }}
    onPointerMoveCapture={e => {
      hoverPoint.current = { x: e.clientX, y: e.clientY }; copyModifier.current = e.altKey;
      if (moveCopyDrag(e)) return;
      updateCopyHint();
      bypass.current = e.altKey;
      const next = reconnectTarget(e.target);
      setReconnectHover(previous => previous?.edgeId === next?.edgeId && previous?.end === next?.end ? previous : next);
    }}
    onPointerLeave={() => { hoverPoint.current = null; updateCopyHint(); setReconnectHover(null); }}
    onPointerDownCapture={e => {
      hoverPoint.current = { x: e.clientX, y: e.clientY }; copyModifier.current = e.altKey;
      copyClick.current = false;
      if (copyGesture.current) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.button === 0 && e.altKey && !props.hand && !props.referenceMode && props.onPrepareCopyDrag && e.target instanceof Element
        && !e.target.closest(`${controlSelector},.nodrag,.react-flow__handle,.react-flow__edgeupdater`)) {
        const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
        if (id) {
          const ids = selectionRef.current.includes(id) ? [...selectionRef.current] : [id];
          const prepared = props.onPrepareCopyDrag(ids);
          // An unsupported placeholder must not turn an Alt drag into a move of the original.
          e.preventDefault(); e.stopPropagation(); copyClick.current = true;
          if (!prepared?.ids.length) return;
          const nodes = graphRef.current.nodes.filter(node => prepared.ids.includes(node.id));
          if (!nodes.length) return;
          setSelection(prepared.ids); latest.current.onGuides(null);
          copyGesture.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, zoom: props.view.zoom,
            root: e.currentTarget, nodes, moved: false, offset: { x: 0, y: 0 }, commit: prepared.commit };
          updateCopyHint();
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.closest<HTMLElement>('main')?.focus({ preventScroll: true });
          return;
        }
      }
      reconnectClick.current = null;
      const endpoint = e.button === 0 ? reconnectTarget(e.target) : null;
      const edge = endpoint && latest.current.connections?.find(item => item.id === endpoint.edgeId);
      if (endpoint && edge) reconnectClick.current = { nodeId: edge[endpoint.end],
        handleId: (endpoint.end === 'source' ? edge.sourceHandle : edge.targetHandle) ?? (endpoint.end === 'source' ? 'free-right' : 'free-left'), dragged: false };
      if (e.target instanceof Element) {
        const control = e.target.closest(controlSelector);
        control?.classList.add('nodrag');
        if (!control) e.currentTarget.closest<HTMLElement>('main')?.focus({ preventScroll: true });
        // Wheel-only rows keep their empty space available for dragging the node.
        // Their buttons remain protected by controlSelector above.
        const field = e.target.closest('textarea,[data-canvas-scroll]:not([data-canvas-scroll="wheel"])');
        field?.classList.add('nodrag');
      }
    }}
    onPointerUpCapture={e => { if (moveCopyDrag(e)) finishCopyDrag(true); }}
    onPointerCancelCapture={e => { if (copyGesture.current?.pointer === e.pointerId) finishCopyDrag(false); }}
    onLostPointerCapture={e => { if (copyGesture.current?.pointer === e.pointerId) finishCopyDrag(false); }}
    onContextMenuCapture={e => { if (copyGesture.current) { e.preventDefault(); e.stopPropagation(); finishCopyDrag(false); } }}
    onMouseDownCapture={e => {
      if (copyClick.current) { e.preventDefault(); e.stopPropagation(); return; }
      shiftClick.current = false;
      if (e.button !== 0 || props.hand || props.referenceMode || !(e.target instanceof Element)) return;
      if (e.target.closest(`${controlSelector},.react-flow__handle,.react-flow__edgeupdater`)) return;
      const edgeId = e.target.closest('.lc-flow-free-edge')?.getAttribute('data-id');
      if (edgeId && freeConnections) {
        e.preventDefault(); e.stopPropagation(); shiftClick.current = true;
        const ids = connectionSelectionRef.current;
        setConnectionSelection(e.shiftKey ? (ids.includes(edgeId) ? ids.filter(id => id !== edgeId) : [...ids, edgeId]) : [edgeId]);
        if (!e.shiftKey) setSelection([]);
        return;
      }
      const id = e.target.closest('.react-flow__node')?.getAttribute('data-id');
      if (!id) return;
      if (!e.shiftKey) {
        if (freeConnections && connectionSelectionRef.current.length) setConnectionSelection([]);
        return;
      }
      // Handle additive clicks before XYDrag's native mousedown listener.
      // A deselected node would otherwise still become the drag anchor. Reading
      // the mouse modifier also works if Shift was held before canvas focus.
      e.preventDefault();
      e.stopPropagation();
      shiftClick.current = true;
      const ids = selectionRef.current;
      setSelection(ids.includes(id) ? ids.filter(selected => selected !== id) : [...ids, id]);
    }}
    onClickCapture={e => {
      if (copyClick.current) { copyClick.current = false; e.preventDefault(); e.stopPropagation(); return; }
      const endpoint = reconnectClick.current;
      reconnectClick.current = null;
      if (endpoint) {
        e.preventDefault(); e.stopPropagation();
        if (!endpoint.dragged) {
          // The transparent updater owns the pointer gesture, but a click still
          // belongs to the original port and opens its existing media menu.
          e.currentTarget.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(endpoint.nodeId)}"] .lc-flow-free-handle[data-handleid="${CSS.escape(endpoint.handleId)}"]`)?.click();
        }
        return;
      }
      if (!shiftClick.current) return;
      shiftClick.current = false;
      e.stopPropagation();
    }}
    onWheelCapture={e => {
      if (copyGesture.current) { e.preventDefault(); e.stopPropagation(); return; }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.target instanceof Element) {
        const field = e.target.closest('textarea,[data-canvas-scroll]');
        if (field && field.scrollHeight > field.clientHeight) e.stopPropagation();
      }
    }}>
    <ReactFlow<ContentNode, CanvasEdge> nodes={graph.nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      defaultViewport={props.view} viewport={props.view} onViewportChange={onViewport} onNodesChange={onChanges} onEdgesChange={onEdgeChanges}
      onSelectionStart={() => latest.current.onSelecting(true)} onSelectionEnd={() => latest.current.onSelecting(false)}
      onNodeDragStart={beginDrag} onNodeDragStop={endDrag}
      onSelectionDragStart={(e, nodes) => { if (nodes[0]) beginDrag(e, nodes[0], nodes); }} onSelectionDragStop={endDrag}
      nodeDragThreshold={0}
      nodesDraggable={!props.hand && !props.referenceMode} elementsSelectable={!props.hand && !props.referenceMode}
      // Blank-space dragging already enables marquee selection. Binding Shift
      // to it too makes Pane capture node clicks before additive selection.
      selectionOnDrag={!props.hand && !props.referenceMode} selectionMode={SelectionMode.Partial} selectionKeyCode={null} multiSelectionKeyCode="Shift"
      panOnDrag={props.hand || props.referenceMode ? true : [1]} panActivationKeyCode={props.spacePanControlled ? null : 'Space'}
      panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch zoomActivationKeyCode={['Alt','Meta','Control']}
      proOptions={{ hideAttribution: true }}
      minZoom={0.03} maxZoom={2} zoomOnDoubleClick={false} deleteKeyCode={null}
      nodesConnectable={connectable} edgesReconnectable={false} connectionMode={ConnectionMode.Loose} connectOnClick={false}
      // A zero library radius keeps the updater centred on the real Handle.
      // CSS supplies its transparent hit radius without shifting the anchor.
      isValidConnection={isValidConnection} connectionLineComponent={LightchainConnectionLine} connectionRadius={24 / props.view.zoom} reconnectRadius={0}
      onConnect={connection => { if (isValidConnection(connection)) latest.current.onConnect?.(connection); }}
      onConnectStart={() => setConnecting(true)} onConnectEnd={() => setConnecting(false)}
      onReconnect={props.onReconnect ? (edge, connection) => { if (edge.type === 'lightchain-free' && isValidConnection(connection)) latest.current.onReconnect?.(edge.id, connection); } : undefined}
      onReconnectStart={(_, edge) => { if (reconnectClick.current) reconnectClick.current.dragged = true; reconnectingId.current = edge.id; setConnecting(true); }}
      onReconnectEnd={() => { reconnectingId.current = null; setReconnectHover(null); setConnecting(false); }}
      elevateNodesOnSelect={false} elevateEdgesOnSelect={false}
      autoPanOnNodeDrag={false} autoPanOnSelection={false} autoPanOnConnect={false} disableKeyboardA11y
      onPaneClick={() => {
        // Tasks can select results while the hand tool is active. React Flow
        // skips its own reset when elementsSelectable is false, so clear the
        // controlled selection here in either tool; panning still suppresses clicks.
        if (!latest.current.referenceMode) {
          setSelection([]);
          if (latest.current.onConnect) setConnectionSelection([]);
        }
      }} />
    {copyPreview && <div className="lc-flow-copy-preview" aria-hidden="true" inert>
      <div style={{ transform: `translate(${props.view.x}px, ${props.view.y}px) scale(${props.view.zoom})`, transformOrigin: '0 0' }}>
        {copyPreview.nodes.map(node => <div key={node.id} className="lc-flow-copy-preview-node" style={{
          left: node.position.x + copyPreview.offset.x, top: node.position.y + copyPreview.offset.y,
          width: node.width, height: node.height,
        }}>{node.data.content}</div>)}
      </div>
    </div>}
  </div>;
}
