// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { NEW_BUILD, TrussBuilder, buildOn, buildResult, ghostIds, type BuildState } from '../../src/renderer/features/stage3d/TrussBuilder';
import { chainPieces } from '../../src/core/visualizer/assembly';
import { createProject } from '../../src/core/project/format';
import type { Project } from '../../src/core/model/schemas';

/* Truss builder panel: piece list, preview controls and the validation it hands to the 3D view. */
function Harness({ vis, start, onAdd }: { vis: Project['visualizer']; start: BuildState; onAdd: (b: BuildState) => void }) {
  const [build, setBuild] = useState(start);
  return <TrussBuilder vis={vis} build={build} setBuild={setBuild} onAdd={() => onAdd(build)} onClose={() => undefined} />;
}

const base = createProject('Constructeur').visualizer;
/** Scene holding one 2 m upright, built by the builder logic itself. */
const upright = { ...base, trusses: chainPieces([], null, { catalogId: 'quatro-s200', connIdx: 0, roll: 0, count: 1, vertical: true }, ['m'], { x: 0, y: 4, z: 0 }).trusses };

describe('constructeur de structures', () => {
  it('choisit une pièce, la pivote, la répète et la valide', () => {
    let added: BuildState | null = null;
    render(<Harness vis={upright} start={buildOn(upright.trusses, 'm')} onAdd={(b) => { added = b; }} />);
    expect(screen.getByTestId('truss-builder').textContent).toContain('connecteur b');
    fireEvent.change(screen.getByTestId('truss-search'), { target: { value: 'Droite 1 m' } });
    fireEvent.click(screen.getByTestId('truss-piece-quatro-s100'));
    fireEvent.click(screen.getByTestId('truss-rotate'));
    fireEvent.click(screen.getByTestId('truss-flip'));
    fireEvent.change(screen.getByTestId('truss-repeat'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('truss-add'));
    expect(added).toMatchObject({ catalogId: 'quatro-s100', roll: 1, connIdx: 1, count: 3, anchor: { pieceId: 'm', connector: 'b' } });
    // What the 3D view previews and then saves: 3 pieces stacked on the upright.
    const r = buildResult(upright, added!, ghostIds(added!));
    expect('trusses' in r && r.trusses).toHaveLength(4);
  });

  it('impose le système du connecteur et signale un connecteur déjà pris', () => {
    const used = { ...upright, trusses: chainPieces(upright.trusses, { pieceId: 'm', connector: 'b' }, { catalogId: 'quatro-s100', connIdx: 0, roll: 0, count: 1 }, ['n'], { x: 0, y: 0, z: 0 }).trusses };
    render(<Harness vis={used} start={{ ...NEW_BUILD, anchor: { pieceId: 'm', connector: 'b' } }} onAdd={() => undefined} />);
    expect((screen.getByTestId('truss-system') as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByTestId('truss-piece-trio-s100')).toBeNull();
    fireEvent.click(screen.getByTestId('truss-piece-quatro-s100'));
    expect(screen.getByTestId('truss-error').textContent).toMatch(/déjà utilisé/);
    expect((screen.getByTestId('truss-add') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId('truss-total').textContent).toContain('2');
  });

  it('démarre une nouvelle structure debout au centre du plateau', () => {
    let added: BuildState | null = null;
    render(<Harness vis={base} start={NEW_BUILD} onAdd={(b) => { added = b; }} />);
    expect((screen.getByTestId('truss-upright') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('truss-piece-quatro-s300'));
    fireEvent.click(screen.getByTestId('truss-add'));
    const r = buildResult(base, added!, ['x']);
    expect('trusses' in r && r.trusses[0]).toMatchObject({ shape: 'totem', x: 0, y: base.stageDepth / 2, height: 3 });
  });
});
