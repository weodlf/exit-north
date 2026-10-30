"""Author the original, skinned civilian in Blender; no third-party model assets.
Run: blender --background --python scripts/create-character.py
Coordinates in this script are (x, height, depth); the character faces -depth.
"""
import bpy, math
from mathutils import Vector
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'assets';ASSETS.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):bpy.data.materials.remove(data)
bpy.context.preferences.filepaths.save_version=0
parts=[]
def xyz(x,y,z):return (x,-z,y)
def material(name,color,rough=.8,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    node=m.node_tree.nodes.get('Principled BSDF');node.inputs['Base Color'].default_value=(*color,1);node.inputs['Roughness'].default_value=rough;node.inputs['Metallic'].default_value=metal
    return m
M={
'coat':material('CoatFabric',(.105,.164,.174),.87),
'seam':material('CoatSeams',(.17,.23,.22),.85),
'lining':material('WarmLining',(.36,.32,.24)),
'pants':material('TrouserFabric',(.175,.195,.158),.9),
'pants_seam':material('TrouserSeams',(.23,.25,.205)),
'skin':material('Skin',(.58,.385,.265),.68),
'face':material('FaceDetail',(.32,.17,.12)),
'hair':material('Hair',(.025,.033,.029),.64),
'hairlight':material('HairStrands',(.042,.052,.043),.63),
'eye':material('Eyes',(.095,.12,.105),.28),
'white':material('EyeHighlights',(.65,.65,.54),.3),
'bag':material('CanvasBackpack',(.29,.235,.125),.94),
'bag_seam':material('CanvasPiping',(.40,.335,.205)),
'leather':material('LeatherStraps',(.105,.085,.055),.8),
'metal':material('BrushedHardware',(.33,.34,.28),.38,.6),
'boot':material('BootLeather',(.09,.095,.078),.72),
'sole':material('Sole',(.045,.055,.045),.95),
}
def weights(o,fn):
    for v in o.data.vertices:
        p=o.matrix_world@v.co
        for bone,w in fn(p).items():
            if w>0:
                group=o.vertex_groups.get(bone) or o.vertex_groups.new(name=bone)
                group.add([v.index],w,'REPLACE')
def finish(o,name,mat,bone=None,fn=None):
    o.name=name;o.data.materials.append(M[mat]);parts.append(o)
    for p in o.data.polygons:p.use_smooth=True
    if fn:weights(o,fn)
    elif bone:weights(o,lambda p:{bone:1})
    return o

def sphere(name,pos,scale,mat,bone,segments=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=12,location=xyz(*pos));o=bpy.context.object;o.scale=(scale[0],scale[2],scale[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    return finish(o,name,mat,bone)
def box(name,pos,size,mat,bone,bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1,location=xyz(*pos));o=bpy.context.object;o.scale=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft tailored edges','BEVEL');mod.width=bevel;mod.segments=3;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return finish(o,name,mat,bone)
def curve(name,points,radius,mat,bone):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=radius;c.bevel_resolution=2
    s=c.splines.new('BEZIER');s.bezier_points.add(len(points)-1)
    for p,coord in zip(s.bezier_points,points):p.co=xyz(*coord);p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    bpy.ops.object.select_all(action='DESELECT')
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object;o.select_set(False)
    return finish(o,name,mat,bone)
def loft(name,rings,mat,fn,segments=24):
    verts=[];faces=[]
    for y,cx,cz,rx,rz in rings:
        for j in range(segments):
            theta=j*math.tau/segments;verts.append(xyz(cx+math.cos(theta)*rx,y,cz+math.sin(theta)*rz))
    for i in range(len(rings)-1):
        for j in range(segments):
            a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
    faces.extend([tuple(range(segments)),tuple(reversed(range((len(rings)-1)*segments,len(rings)*segments)))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o);return finish(o,name,mat,fn=fn)
def rigid(bone):return lambda p:{bone:1}
def torso_weights(p):
    y=p.z
    if y<1.035:return {'Hips':1}
    if y<1.15:
        t=(y-1.035)/.115;return {'Hips':1-t,'Spine':t}
    if y<1.32:
        t=(y-1.15)/.17;return {'Spine':1-t,'Chest':t}
    return {'Chest':1}
loft('Tailored bomber jacket',[
(.98,0,0,.175,.12),(1.01,0,0,.19,.133),(1.08,0,.002,.20,.139),(1.17,0,.002,.207,.145),(1.31,0,0,.235,.143),(1.42,0,0,.255,.132),(1.48,0,0,.215,.115),(1.515,0,0,.11,.085)],'coat',torso_weights)
loft('Ribbed jacket hem',[(.97,0,0,.175,.12),(.988,0,0,.187,.128),(1.03,0,0,.19,.132)],'seam',rigid('Hips'))
loft('Pants waist',[(.88,0,0,.155,.111),(.96,0,0,.168,.12),(1.015,0,0,.168,.118)],'pants',rigid('Hips'))
box('Woven belt',(0,1.012,0),(.34,.036,.245),'leather','Hips',.01)
box('Belt buckle',(0,1.012,-.13),(.045,.028,.012),'metal','Hips',.004)
# Worn lining, standing collar and a visible centre seam.
loft('Neck',[(1.485,0,0,.068,.065),(1.60,0,0,.065,.067),(1.635,0,-.005,.072,.07)],'skin',rigid('Neck'),20)
curve('Padded collar',[(-.105,1.48,-.075),(-.12,1.53,0),(0,1.55,.095),(.12,1.53,0),(.105,1.48,-.075)],.025,'coat','Chest')
curve('Inner collar trim',[(-.10,1.50,-.073),(-.1,1.55,.01),(0,1.56,.078),(.1,1.55,.01),(.1,1.50,-.073)],.009,'lining','Chest')
curve('Jacket zipper',[(0,1.02,-.138),(0,1.15,-.15),(0,1.32,-.15),(0,1.48,-.111)],.0034,'metal','Chest')
box('Zipper pull',(0,1.38,-.157),(.015,.035,.008),'metal','Chest',.002)
for sign in [-1,1]:
    suffix='L' if sign<0 else 'R';arm='UpperArm.'+suffix;fore='Forearm.'+suffix;hand='Hand.'+suffix;thigh='Thigh.'+suffix;shin='Shin.'+suffix;foot='Foot.'+suffix
    box('Chest pocket '+suffix,(sign*.13,1.325,-.145),(.135,.115,.028),'coat','Chest',.015)
    box('Chest pocket flap '+suffix,(sign*.13,1.375,-.158),(.145,.026,.025),'seam','Chest',.006)
    sphere('Pocket snap '+suffix,(sign*.13,1.371,-.173),(.006,.006,.003),'metal','Chest',12)
    curve('Lower welt pocket '+suffix,[(sign*.11,1.07,-.117),(sign*.15,1.13,-.116),(sign*.185,1.18,-.10)],.006,'seam','Spine')
    curve('Shoulder stitch '+suffix,[(sign*.08,1.48,.08),(sign*.18,1.455,.1),(sign*.25,1.42,.015)],.0025,'seam','Chest')
    def arm_weights(p,arm=arm,fore=fore):
        t=max(0,min(1,(1.22-p.z)/.16));return {arm:1-t,fore:t}
    loft('Continuous sleeve '+suffix,[(.895,sign*.348,0,.055,.054),(.94,sign*.344,0,.064,.062),(1.05,sign*.335,0,.077,.079),(1.15,sign*.317,0,.079,.082),(1.22,sign*.307,0,.084,.084),(1.34,sign*.282,0,.096,.098),(1.43,sign*.255,0,.105,.109),(1.47,sign*.235,0,.08,.084)],'coat',arm_weights,20)
    loft('Sleeve cuff '+suffix,[(.884,sign*.349,0,.054,.054),(.91,sign*.347,0,.059,.059),(.936,sign*.344,0,.061,.061)],'seam',rigid(fore),20)
    for j in range(3):curve('Sleeve fold '+suffix+str(j),[(sign*.292,1.135+j*.019,-.065),(sign*.324,1.145+j*.019,-.077),(sign*.36,1.14+j*.019,-.054)],.0028,'seam',fore)
    sphere('Hand palm '+suffix,(sign*.354,.835,-.007),(.045,.071,.025),'skin',hand)
    for i in range(4):
        x=sign*.354+(i-1.5)*.019;length=[.041,.06,.064,.049][i]
        sphere('Finger '+suffix+str(i),(x,.78-length*.2,-.014),(.009,length,.011),'skin',hand,12)
    thumb=sphere('Thumb '+suffix,(sign*.312,.823,-.027),(.016,.038,.015),'skin',hand,12);thumb.rotation_euler[1]=sign*.4
    def leg_weights(p,thigh=thigh,shin=shin):
        t=max(0,min(1,(.60-p.z)/.17));return {thigh:1-t,shin:t}
    loft('Continuous trousers '+suffix,[(.17,sign*.105,.012,.072,.075),(.24,sign*.105,.006,.077,.082),(.37,sign*.106,.002,.087,.089),(.49,sign*.107,-.005,.093,.094),(.56,sign*.108,-.009,.096,.098),(.69,sign*.11,0,.106,.111),(.82,sign*.109,0,.112,.118),(.94,sign*.105,0,.113,.12)],'pants',leg_weights,24)
    for j in range(3):curve('Knee cloth fold '+suffix+str(j),[(sign*.165,.49+j*.022,-.06),(sign*.105,.485+j*.022,-.101),(sign*.045,.49+j*.022,-.065)],.0028,'pants_seam',shin)
    curve('Outer trouser seam '+suffix,[(sign*.215,.85,0),(sign*.205,.7,0),(sign*.201,.55,0)],.0024,'pants_seam',thigh)
    box('Boot upper '+suffix,(sign*.105,.105,-.045),(.165,.155,.295),'boot',foot,.04)
    box('Boot sole '+suffix,(sign*.105,.03,-.052),(.177,.048,.31),'sole',foot,.017)
    loft('Boot ankle '+suffix,[(.10,sign*.105,.01,.075,.083),(.19,sign*.105,.016,.073,.075),(.205,sign*.105,.016,.068,.073)],'boot',rigid(foot),20)
    for i in range(4):curve('Boot lace '+suffix+str(i),[(sign*.105-.038,.16-i*.012,-.03-i*.025),(sign*.105+.038,.16-i*.012,-.03-i*.025)],.0026,'lining',foot)
# Face with shaped jaw, eyelids, ears and swept rather than hemispherical hair.
loft('Head sculpt',[(1.625,0,-.018,.055,.057),(1.65,0,-.013,.075,.081),(1.70,0,-.005,.106,.102),(1.76,0,0,.125,.112),(1.81,0,.005,.127,.112),(1.86,0,.008,.107,.1),(1.895,0,.008,.066,.062),(1.91,0,.008,.009,.009)],'skin',rigid('Head'),32)
for sign in [-1,1]:
    sphere('Ear',(sign*.128,1.758,.006),(.025,.041,.017),'skin','Head',16)
    sphere('Ear inner',(sign*.142,1.758,-.001),(.009,.024,.011),'face','Head',12)
    sphere('Eye white',(sign*.047,1.79,-.105),(.027,.01,.009),'white','Head',16)
    sphere('Iris',(sign*.047,1.79,-.114),(.009,.009,.003),'eye','Head',12)
    sphere('Eye glint',(sign*.044,1.794,-.117),(.002,.002,.001),'white','Head',8)
    curve('Upper eyelid',[(sign*.072,1.791,-.104),(sign*.047,1.802,-.111),(sign*.022,1.792,-.106)],.003,'face','Head')
    curve('Eyebrow',[(sign*.076,1.82,-.097),(sign*.048,1.827,-.106),(sign*.022,1.822,-.105)],.005,'hair','Head')
    sphere('Nostril',(sign*.015,1.735,-.139),(.009,.005,.005),'face','Head',12)
sphere('Nose bridge',(0,1.77,-.115),(.017,.032,.015),'skin','Head',16)
sphere('Nose tip',(0,1.741,-.137),(.024,.018,.02),'skin','Head',16)
curve('Mouth', [(-.029,1.698,-.106),(-.012,1.702,-.113),(0,1.699,-.116),(.012,1.702,-.113),(.029,1.698,-.106)],.0024,'face','Head')
sphere('Lower lip',(0,1.692,-.108),(.023,.005,.006),'skin','Head',12)
# Custom hair shell: higher hairline at forehead and a gently asymmetric crown.
verts=[];faces=[];segments=40
for i in range(7):
    t=i/6
    for j in range(segments):
        a=j*math.tau/segments;front=max(0,-math.sin(a));bottom=1.765+.072*front
        h=bottom+(1.934-bottom)*t;r=math.sqrt(max(.003,1-t*t))
        verts.append(xyz(.012*t+math.cos(a)*.133*r,h,.01+math.sin(a)*.119*r))
for i in range(6):
    for j in range(segments):a=i*segments+j;b=i*segments+(j+1)%segments;faces.append((a,a+segments,b+segments,b))
mesh=bpy.data.meshes.new('Swept hair mesh');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Swept hair',mesh);bpy.context.collection.objects.link(o);finish(o,'Swept hair','hair','Head')
for i in range(7):
    x=-.09+i*.024
    curve('Swept hair strand '+str(i),[(x,1.84,-.105),(x-.015,1.89,-.119),(x+.025,1.926,-.07),(x+.055,1.91,.012)],.007 if i%2 else .009,'hairlight' if i%2 else 'hair','Head')
# Canvas backpack, real roll-top silhouette, rounded pockets, buckles and stitching.
box('Backpack body',(0,1.255,.231),(.315,.44,.205),'bag','Chest',.065)
box('Backpack front pocket',(0,1.13,.355),(.255,.175,.062),'bag','Chest',.027)
box('Roll top',(0,1.48,.232),(.35,.085,.225),'bag_seam','Chest',.035)
curve('Carry handle',[(-.06,1.51,.2),(-.055,1.57,.19),(.055,1.57,.19),(.06,1.51,.2)],.009,'leather','Chest')
curve('Pocket piping',[(-.105,1.065,.39),(-.127,1.12,.39),(-.11,1.205,.39),(.11,1.205,.39),(.127,1.12,.39),(.105,1.065,.39),(-.105,1.065,.39)],.0032,'bag_seam','Chest')
for sign in [-1,1]:
    curve('Shoulder strap',[(sign*.15,1.04,-.136),(sign*.17,1.25,-.149),(sign*.18,1.46,-.04),(sign*.15,1.49,.15),(sign*.14,1.27,.22)],.018,'leather','Chest')
    curve('Strap stitch',[(sign*.16,1.07,-.151),(sign*.18,1.25,-.161),(sign*.19,1.44,-.05)],.002,'bag_seam','Chest')
    box('Shoulder adjuster',(sign*.173,1.18,-.168),(.045,.04,.01),'metal','Chest',.005)
    box('Backpack front webbing',(sign*.092,1.28,.365),(.025,.34,.016),'leather','Chest',.004)
    box('Backpack clasp',(sign*.092,1.31,.38),(.045,.052,.017),'metal','Chest',.006)
    box('Clasp inset',(sign*.092,1.31,.391),(.022,.025,.005),'leather','Chest',.002)
    curve('Pack edge piping',[(sign*.13,1.05,.27),(sign*.16,1.22,.29),(sign*.13,1.44,.28)],.003,'bag_seam','Chest')
# Join mesh primitives before adding the armature: one draw per material, shared skin.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();human=bpy.context.object;human.name='Yun_Civilian';
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
# Armature with continuous blended sleeve and trouser weights.
bpy.ops.object.select_all(action='DESELECT');bpy.ops.object.armature_add();arm=bpy.context.object;arm.name='Civilian_Rig';bpy.ops.object.mode_set(mode='EDIT');arm.data.edit_bones.remove(arm.data.edit_bones[0])
def bone(name,head,tail,parent=None):
    b=arm.data.edit_bones.new(name);b.head=xyz(*head);b.tail=xyz(*tail)
    if parent:b.parent=arm.data.edit_bones[parent]
    return b
bone('Hips',(0,.9,0),(0,1.03,0));bone('Spine',(0,1.03,0),(0,1.25,0),'Hips');bone('Chest',(0,1.25,0),(0,1.50,0),'Spine');bone('Neck',(0,1.50,0),(0,1.62,0),'Chest');bone('Head',(0,1.62,0),(0,1.92,0),'Neck')
for sign in [-1,1]:
    s='L' if sign<0 else 'R'
    bone('UpperArm.'+s,(sign*.25,1.44,0),(sign*.32,1.15,0),'Chest');bone('Forearm.'+s,(sign*.32,1.15,0),(sign*.348,.9,0),'UpperArm.'+s);bone('Hand.'+s,(sign*.348,.9,0),(sign*.355,.75,0),'Forearm.'+s)
    bone('Thigh.'+s,(sign*.105,.93,0),(sign*.107,.52,-.009),'Hips');bone('Shin.'+s,(sign*.107,.52,-.009),(sign*.105,.15,.01),'Thigh.'+s);bone('Foot.'+s,(sign*.105,.15,.01),(sign*.105,.07,-.17),'Shin.'+s)
bpy.ops.object.mode_set(mode='OBJECT');human.parent=arm;modifier=human.modifiers.new('Continuous character skin','ARMATURE');modifier.object=arm
# Four exported clips; all actions are reusable by the browser AnimationMixer.
arm.animation_data_create();bpy.context.scene.render.fps=30
for name,frames,amp in [('Idle',60,0),('Walk',30,.5),('Run',22,.83),('Sneak',42,.32)]:
    action=bpy.data.actions.new(name);arm.animation_data.action=action
    for frame in range(frames+1):
        phase=frame/frames*math.tau
        for pb in arm.pose.bones:pb.rotation_mode='XYZ';pb.rotation_euler=(0,0,0);pb.location=(0,0,0)
        hips=arm.pose.bones['Hips'];hips.location.y=(abs(math.sin(phase))*.025 if amp else math.sin(phase)*.004)-(.23 if name=='Sneak' else 0)
        arm.pose.bones['Spine'].rotation_euler.x=.18 if name=='Run' else .29 if name=='Sneak' else .015*math.sin(phase)
        arm.pose.bones['Chest'].rotation_euler.y=.025*math.sin(phase)
        arm.pose.bones['Head'].rotation_euler.y=.025*math.sin(phase*.5) if name=='Idle' else 0
        for i,s in enumerate(['L','R']):
            wave=math.sin(phase+i*math.pi)
            arm.pose.bones['Thigh.'+s].rotation_euler.x=wave*amp-(.45 if name=='Sneak' else 0)
            arm.pose.bones['Shin.'+s].rotation_euler.x=max(0,-wave)*amp*.85+(.82 if name=='Sneak' else .025)
            arm.pose.bones['UpperArm.'+s].rotation_euler.x=-wave*amp*.72
            arm.pose.bones['Forearm.'+s].rotation_euler.x=-.7 if name=='Run' else -.52 if name=='Sneak' else -.13
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_euler',frame=frame,group=pb.name);pb.keyframe_insert('location',frame=frame,group=pb.name)
    for fc in action.fcurves:
        for key in fc.keyframe_points:key.interpolation='LINEAR'
    track=arm.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0,action);track.mute=True
arm.animation_data.action=bpy.data.actions['Idle']
scene=bpy.context.scene;scene.frame_start=0;scene.frame_end=60;scene.frame_set(0)
# Keep a native editable source, not just a flattened rendering.
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS/'civilian.blend'))
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);human.select_set(True);bpy.context.view_layer.objects.active=arm
bpy.ops.export_scene.gltf(filepath=str(ASSETS/'civilian.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_apply=False,export_yup=True)
print('CIVILIAN_MODEL_DONE',len(human.data.vertices),'vertices',len(human.data.polygons),'faces',len(arm.data.bones),'bones')
