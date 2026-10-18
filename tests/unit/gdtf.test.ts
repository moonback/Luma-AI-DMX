import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { cieToHex, convertGdtf, dmx8 } from '../../src/core/fixtures/gdtf';
import { writeZip } from '../../src/core/util/zip';
import { makeService } from '../helpers';

const gdtf = (xml: string) => writeZip([{ name: 'description.xml', data: Buffer.from(xml) }]);

const SPOT = `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.1">
  <FixtureType Name="Spot 300" ShortName="S300" LongName="Test Spot 300" Manufacturer="Acme" FixtureTypeID="00000000-0000-0000-0000-000000000001">
    <Wheels>
      <Wheel Name="Color1">
        <Slot Name="Open" Color="0.3127,0.3290,100.0"/>
        <Slot Name="Red" Color="0.64,0.33,21.3"/>
        <Slot Name="Blue" Color="0.15,0.06,7.2"/>
      </Wheel>
    </Wheels>
    <Geometries>
      <Geometry Name="Base"><Axis Name="Yoke"><Axis Name="Head"><Beam Name="Beam" BeamAngle="18"/></Axis></Axis></Geometry>
    </Geometries>
    <DMXModes>
      <DMXMode Name="Extended" Geometry="Base">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1,2" Geometry="Yoke">
            <LogicalChannel Attribute="Pan"><ChannelFunction Name="Pan" Attribute="Pan" DMXFrom="0/2" Default="32768/2" PhysicalFrom="-270" PhysicalTo="270"/></LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3,4" Geometry="Head">
            <LogicalChannel Attribute="Tilt"><ChannelFunction Name="Tilt" Attribute="Tilt" DMXFrom="0/2" Default="32768/2" PhysicalFrom="-135" PhysicalTo="135"/></LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="5" Geometry="Beam">
            <LogicalChannel Attribute="Shutter1">
              <ChannelFunction Name="Closed" Attribute="Shutter1" DMXFrom="0/1" Default="0/1"><ChannelSet Name="Closed" DMXFrom="0/1"/></ChannelFunction>
              <ChannelFunction Name="Open" Attribute="Shutter1" DMXFrom="32/1"><ChannelSet Name="Open" DMXFrom="32/1"/></ChannelFunction>
              <ChannelFunction Name="Strobe" Attribute="Shutter1Strobe" DMXFrom="64/1" PhysicalFrom="1" PhysicalTo="20"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="6" Geometry="Beam">
            <LogicalChannel Attribute="Dimmer"><ChannelFunction Name="Dimmer" Attribute="Dimmer" DMXFrom="0/1" Default="0/1"/></LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="7" Geometry="Beam">
            <LogicalChannel Attribute="Color1">
              <ChannelFunction Name="Color" Attribute="Color1" DMXFrom="0/1" Wheel="Color1">
                <ChannelSet Name="Open" DMXFrom="0/1" WheelSlotIndex="1"/>
                <ChannelSet Name="Red" DMXFrom="10/1" WheelSlotIndex="2"/>
                <ChannelSet Name="Blue" DMXFrom="20/1" WheelSlotIndex="3"/>
              </ChannelFunction>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="9" Geometry="Beam">
            <LogicalChannel Attribute="Control1">
              <ChannelFunction Name="Control" Attribute="Control1" DMXFrom="0/1">
                <ChannelSet Name="No function" DMXFrom="0/1"/>
                <ChannelSet Name="Reset all" DMXFrom="200/1"/>
              </ChannelFunction>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="10" Geometry="Beam">
            <LogicalChannel Attribute="Gobo1"><ChannelFunction Name="Gobo" Attribute="Gobo1" DMXFrom="0/1"><ChannelSet Name="Open" DMXFrom="0/1"/><ChannelSet Name="Gobo 1" DMXFrom="16/1"/></ChannelFunction></LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="" Geometry="Beam">
            <LogicalChannel Attribute="Dimmer"/>
          </DMXChannel>
          <DMXChannel DMXBreak="2" Offset="1" Geometry="Beam">
            <LogicalChannel Attribute="Fans"><ChannelFunction Name="Fan" Attribute="Fans" DMXFrom="0/1"/></LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
      <DMXMode Name="Basic" Geometry="Base">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Geometry="Yoke"><LogicalChannel Attribute="Pan"><ChannelFunction Attribute="Pan" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="2" Geometry="Head"><LogicalChannel Attribute="Tilt"><ChannelFunction Attribute="Tilt" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3" Geometry="Beam"><LogicalChannel Attribute="Dimmer"><ChannelFunction Attribute="Dimmer" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;

const BAR = `<GDTF DataVersion="1.1"><FixtureType Name="Bar 4" ShortName="Bar4" Manufacturer="Acme">
  <Geometries><Geometry Name="Body"><GeometryReference Name="Pixel1"/><GeometryReference Name="Pixel2"/></Geometry></Geometries>
  <DMXModes><DMXMode Name="2px RGB" Geometry="Body"><DMXChannels>
    <DMXChannel Offset="1" Geometry="Body"><LogicalChannel Attribute="Dimmer"><ChannelFunction Attribute="Dimmer" DMXFrom="0/1"/></LogicalChannel></DMXChannel>
    ${[1, 2].map((p) => ['R', 'G', 'B'].map((c, i) => `<DMXChannel Offset="${1 + (p - 1) * 3 + i + 1}" Geometry="Pixel${p}"><LogicalChannel Attribute="ColorAdd_${c}"><ChannelFunction Attribute="ColorAdd_${c}" DMXFrom="0/1"/></LogicalChannel></DMXChannel>`).join('')).join('')}
  </DMXChannels></DMXMode></DMXModes></FixtureType></GDTF>`;

describe('import GDTF', () => {
  it('valeurs DMX GDTF et couleurs CIE', () => {
    expect([dmx8('32768/2'), dmx8('255/1'), dmx8('64'), dmx8('x/1'), dmx8(undefined)]).toEqual([128, 255, 64, undefined, undefined]);
    expect(cieToHex('0.64,0.33,21.3')).toBe('#FF0000');
    expect(cieToHex('0.3127,0.3290,100')).toBe('#FFFFFF');
    expect(cieToHex('nope')).toBeUndefined();
  });

  it('lyre spot : modes, 16 bits, shutter avec Hz, roue de couleurs, reset dangereux, canaux virtuels et breaks ignorés', () => {
    const r = convertGdtf(gdtf(SPOT));
    expect(r.errors).toEqual([]);
    const p = r.profile!;
    expect(p).toMatchObject({ id: 'gdtf-acme-s300', name: 'Test Spot 300', manufacturer: 'Acme', type: 'moving-head-spot' });
    expect(p.physical).toMatchObject({ panRange: 540, tiltRange: 270, beamAngle: 18, tiltMin: -135, tiltMax: 135 });
    expect(p.modes.map((m) => [m.name, m.channels.length])).toEqual([['Extended', 10], ['Basic', 3]]);
    const ch = p.modes[0]!.channels;
    expect(ch.slice(0, 4).map((c) => [c.attribute, c.fine])).toEqual([['pan', false], ['pan', true], ['tilt', false], ['tilt', true]]);
    expect(ch[0]).toMatchObject({ default: 128, default16: 32768 });
    expect(ch[4]!.attribute).toBe('shutter');
    expect(ch[4]!.ranges.map((x) => [x.from, x.to, x.kind])).toEqual([[0, 31, 'closed'], [32, 63, 'open'], [64, 255, 'strobe']]);
    expect(ch[4]!.ranges[2]).toMatchObject({ hzFrom: 1, hzTo: 20 });
    expect(ch[6]!.ranges.map((x) => [x.from, x.to, x.label, x.color])).toEqual([[0, 9, 'Open', undefined], [10, 19, 'Red', '#FF0000'], [20, 255, 'Blue', expect.stringMatching(/^#[0-9A-F]{6}$/)]]);
    expect(ch[7]!.attribute).toMatch(/^custom:inutilise-8/); // hole kept: addresses stay exact
    expect(ch[8]!.ranges.find((x) => x.label === 'Reset all')).toMatchObject({ kind: 'reset', dangerous: true, from: 200 });
    expect(ch[9]!.attribute).toBe('gobo');
    expect(r.warnings.join(' ')).toMatch(/DMX break 2/);
  });

  it('barre LED : géométries répétées → cellules', () => {
    const r = convertGdtf(gdtf(BAR));
    expect(r.errors).toEqual([]);
    const ch = r.profile!.modes[0]!.channels;
    expect(r.profile!.type).toBe('led-bar');
    expect(ch.map((c) => (c.cell ? `${c.attribute}#${c.cell}` : c.attribute))).toEqual(['dimmer', 'red#1', 'green#1', 'blue#1', 'red#2', 'green#2', 'blue#2']);
  });

  it('fichiers invalides : erreurs lisibles, jamais d’exception', () => {
    expect(convertGdtf(new Uint8Array([1, 2, 3])).errors[0]).toMatch(/illisible/);
    expect(convertGdtf(writeZip([{ name: 'other.xml', data: Buffer.from('<x/>') }])).errors[0]).toMatch(/description\.xml/);
    expect(convertGdtf(gdtf('<GDTF><FixtureType Name="X"><DMXModes/></FixtureType></GDTF>')).errors[0]).toMatch(/mode DMX/);
    expect(convertGdtf(gdtf('<GDTF><oops')).errors[0]).toMatch(/invalide/);
  });

  it('profile.import accepte un .gdtf et fusionne les modes du même appareil', async () => {
    const { svc, dataDir } = makeService();
    await svc.init();
    const file = path.join(dataDir, 'spot.gdtf');
    writeFileSync(file, gdtf(SPOT));
    const r = await svc.execute({ type: 'profile.import', path: file });
    expect(r.imported).toEqual(['Test Spot 300']);
    expect(svc.getProject().profiles.find((p) => p.id === 'gdtf-acme-s300')!.modes).toHaveLength(2);
    await svc.dispose();
  });
});
