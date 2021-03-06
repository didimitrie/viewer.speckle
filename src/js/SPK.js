/*
 * Beta.Speckle Parametric Model Viewer
 * Copyright (C) 2016 Dimitrie A. Stefanescu (@idid) / The Bartlett School of Architecture, UCL
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of  MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program.  If not, see <http://www.gnu.org/licenses/>.
 */


// general deps
var $               = require('jquery');
var THREE           = require('three');
var OrbitCtrls      = require('three-orbit-controls')(THREE);
var noUISlider      = require('nouislider');
var TWEEN           = require('tween.js');

// SPK Libs
var SPKLoader       = require('./SPKLoader.js');
var SPKCache        = require('./SPKCache.js');
var SPKMaker        = require('./SPKObjectMaker.js');
var SPKSync         = require('./SPKSync.js');
var SPKConfig       = require('./SPKConfig.js');
var SPKLogger       = require('./SPKLogger.js');
var SPKSaver        = require('./SPKSaver.js');
var SPKUiManager    = require('./SPKUiManager.js');
var SPKMeasures     = require('./SPKMeasures');

var SPK = function (wrapper, options) {

  /*************************************************
  /   SPK Global
  *************************************************/
  
  var SPK = this;
  
  SPK.Options = null;
  /*************************************************
  /   SPK SPK.HMTLs
  *************************************************/

  SPK.HMTL = { 
    wrapper : "" , 
    canvas : "", 
    sidebar : "",
    sliderwrapper : "",
    sliders : "", 
    meta : ""
  };

  /*************************************************
  /   SPK Vars
  *************************************************/

  SPK.GLOBALS = {
    model : "",
    metadata : {
      paramsFile : "",
      staticGeoFile : "",
      rootFiles : ""
    },
    sliders : [],
    currentKey : "",
    boundingSphere : ""
  }

  /*************************************************
  /   THREE vars
  *************************************************/

  SPK.VIEWER = {
    renderer : null,
    camera : null,
    scene : null, 
    controls : null,
    sunlight : null,
    raycaster : null,
  }
  

  SPK.SCENE = {
    grid : null,
    groundplane : null,
    shadowlight : null,
    shadows : false
  }
  /*************************************************
  /   SPK Methods
  *************************************************/
  
  /**
   * Main Init Function
   */
  
  SPK.init = function(wrapper, options) {

    if( wrapper === null ) {

      console.error("No parent element found");

      return;
    }

    SPK.Options = options;

    // get those elements in place, you cunt
    SPK.HMTL.wrapper        = $(wrapper);
    SPK.HMTL.canvas         = $(wrapper).find("#spk-canvas");
    SPK.HMTL.sliderwrapper  = $(wrapper).find("#wrapper-params");
    SPK.HMTL.sliders        = $(wrapper).find("#spk-sliders");
    SPK.HMTL.meta           = $(SPK.HMTL.wrapper).find("#spk-metadata");

    // get the model url
    var href = window.location.pathname;

    SPK.GLOBALS.model = href.substr(href.lastIndexOf('/') + 1);

    // need to init scene before: 
    // getmodel meta > load params > make scene > load static  & first instance (into scene) > 
    // > compute bounding box > setup environment > renderloop
    
    SPK.VIEWER.scene = new THREE.Scene();
    
    // load parameters && go!
    
    SPK.getModelMeta(function () {

      SPK.loadParameters(function () {

        SPK.loadInstance(-1, function () {
          
          SPK.alignSliders();

          SPK.addNewInstance();

          SPK.loadStaticInstance();
          
          SPK.setupEnvironment();
        
          SPK.render(); 

          SPKSync.addInstance(SPK);

          if(options.logger) 
            SPKLogger.newSession(SPK.GLOBALS.model);
          
          if(options.saver)
            SPKSaver.init(SPK);

          SPKUiManager.init();

          SPK.zoomExtents();

        });      

      });

    });

  }

  SPK.getModelMeta = function(callback) {

    $.getJSON(SPKConfig.GEOMAPI + SPK.GLOBALS.model, function (data) {
      
      SPK.GLOBALS.metadata.paramsFile = data.paramsFile.replace("./uploads", SPKConfig.UPLOADDIR);
      SPK.GLOBALS.metadata.paramsFile = SPK.GLOBALS.metadata.paramsFile.replace("//p", "/p");

      SPK.GLOBALS.metadata.staticGeoFile = data.staticGeoFile.replace("./uploads", SPKConfig.UPLOADDIR);
      SPK.GLOBALS.metadata.staticGeoFile =  SPK.GLOBALS.metadata.staticGeoFile.replace("//s", "/s");

      SPK.GLOBALS.metadata.rootFiles = SPK.GLOBALS.metadata.staticGeoFile.replace("/static.json", "/");

      $(".model-name").html(data.modelName);
      
      $(".model-meta").html("Added on " + data.dateAdded + " by " + data.ownerName);

      callback();

    })

  }

  SPK.loadParameters = function(callback) {

    $.getJSON(SPK.GLOBALS.metadata.paramsFile, function(data) {

      var params = data.parameters;

      SPKMeasures.init(data.properties, data.kvpairs, data.propNames);
      
      for( var i = 0; i < params.length; i++ ) {
        
        var paramId = $(SPK.HMTL.wrapper).attr("id") + "_parameter_" + i;
        var paramName = params[i].name === "" ? "Unnamed Parameter" : params[i].name;

        $(SPK.HMTL.sliders).append( $( "<div>", { id: paramId, class: "parameter" } ) );
        
        $( "#" + paramId ).append( "<p class='parameter_name'>" + paramName + "</p>" );
        
        var sliderId = paramId + "_slider_" + i;

        $( "#" + paramId ).append( $( "<div>", { id: sliderId, class: "basic-slider" } ) );

        var myRange = {}, norm = 100 / (params[i].values.length-1);

        for( var j = 0; j < params[i].values.length; j++ ) {

          myRange[ norm * j + "%" ] = params[i].values[j];

        }
        
        myRange["min"] = myRange["0%"]; delete myRange["0%"];
      
        myRange["max"] = myRange["100%"]; delete  myRange["100%"];

        var sliderElem = $( "#" + sliderId )[0];
        
        var slider = noUISlider.create( sliderElem, {
          start : [0],
          conect : false,
          tooltips : false,
          snap : true,
          range : myRange,
          pips : {
            mode : "values",
            values : params[i].values,
            density : 3
          }
        });

        // set the callbacks

        slider.on("slide", SPK.removeCurrentInstance);

        slider.on("change", SPK.addNewInstance);

        slider.on("end", SPK.purgeScene);

        // add to master
        slider.paramName = params[i].name;
        SPK.GLOBALS.sliders.push(slider);
      }

      callback();

    });

  }

  SPK.getCurrentKey = function () {
    
    var key = "";

    for( var i = 0; i < SPK.GLOBALS.sliders.length; i++ ) {

      key += Number( SPK.GLOBALS.sliders[i].get() ).toString() + ","; 

    }

    return key;

  }

  SPK.removeCurrentInstance = function () {

    var opacity = 1;
    var duration = 600;
    var out = [];
    
    for(var i = 0; i < SPK.VIEWER.scene.children.length; i++ ) {

      var myObj = SPK.VIEWER.scene.children[i];
      
      if( myObj.removable ) {

          out.push(myObj);

      }
    }

    var tweenOut = new TWEEN.Tween( { x: opacity } )
    .to( {x: 0}, duration )
    .onUpdate( function() {

      for( var i = 0; i < out.length; i++ ) {

        out[i].material.opacity = this.x;

      }

      if(( this.x >= opacity * 0.5 ) && (this.calledNext===undefined))
      {
        
        //this.calledNext = true;
        //SPK.addNewInstance();
        
      }

    })
    .onComplete( function() {

      for( var i = 0; i < out.length; i++ ) {

        SPK.VIEWER.scene.remove(out[i]);
        out[i].geometry.dispose();
        out[i].material.dispose();

      }

      SPK.addNewInstance(); // on  because we didnt' call half way through in the opacity out 

    })  ;

    tweenOut.start();

  }

  SPK.purgeScene = function() {
    
    // theoretically should do nothing; but we do have cases when we have overlapping instances
    // due to "quickness" of slider drag, and the way we handle object loading. yoop. 

    var opacity = 1;
    var duration = 200;
    var out = [];
    
    for(var i = 0; i < SPK.VIEWER.scene.children.length; i++ ) {

      var myObj = SPK.VIEWER.scene.children[i];
      
      if( (myObj.removable) && (myObj.instance != SPK.GLOBALS.currentKey) ) {

          out.push(myObj);

      }
    }

    var tweenOut = new TWEEN.Tween( { x: opacity } )
    .to( {x: 0}, duration )
    .onUpdate( function() {

      for( var i = 0; i < out.length; i++ ) {

        out[i].material.opacity = this.x;

      }

      if(( this.x >= opacity * 0.5 ) && (this.calledNext===undefined))
      {
        
        this.calledNext = true;
        
      }

    })
    .onComplete( function() {

      for( var i = 0; i < out.length; i++ ) {

        SPK.VIEWER.scene.remove(out[i]);
        out[i].geometry.dispose();
        out[i].material.dispose();

      }

    })  ;

    tweenOut.start();

  }

  SPK.addNewInstance = function() {

    var key = SPK.getCurrentKey();

    if(SPK.GLOBALS.currentKey === key) {
    
      SPK.purgeScene();
      return;
    }

    SPKMeasures.setKey(key);

    SPK.GLOBALS.currentKey = key;
    SPK.loadInstance( key, function() {

      var iin = [];

      for(var i = 0; i < SPK.VIEWER.scene.children.length; i++ ) {

        var myObj = SPK.VIEWER.scene.children[i];
        
        if( myObj.removable ) {
          
          if( myObj.instance === SPK.GLOBALS.currentKey ) {

            iin.push(myObj);

          } 
        }
      }

      var duration = 300, opacity = 1;
      
      var tweenIn = new TWEEN.Tween( { x : 0 } )
      .to( { x: opacity }, duration )
      .onUpdate( function() {
        for( var i = 0; i < iin.length; i++ ) {

          iin[i].material.opacity = this.x;

        }
      })

      tweenIn.start();

    });

  }

  SPK.computeBoundingSphere = function() {

    var geometry = new THREE.Geometry();

    for(var i = 0; i < SPK.VIEWER.scene.children.length; i++) {

      if(SPK.VIEWER.scene.children[i].selectable) {
        
        geometry.merge(SPK.VIEWER.scene.children[i].geometry);
      
      }
    }


    geometry.computeBoundingSphere();

    SPK.GLOBALS.boundingSphere = geometry.boundingSphere;
    
    geometry.dispose();

  }

  SPK.setupEnvironment = function () {
    // TODO: Grids, etc.
    // 
    // make the scene + renderer

    SPK.VIEWER.renderer = new THREE.WebGLRenderer( { antialias : true, alpha: true} );

    SPK.VIEWER.renderer.setClearColor( 0xF2F2F2 ); 

    SPK.VIEWER.renderer.setPixelRatio( 1 );  // change to window.devicePixelRatio 
    //SPK.VIEWER.renderer.setPixelRatio( window.devicePixelRatio );  // change to window.devicePixelRatio 
    
    SPK.VIEWER.renderer.setSize( $(SPK.HMTL.canvas).innerWidth(), $(SPK.HMTL.canvas).innerHeight() ); 

    SPK.VIEWER.renderer.shadowMap.enabled = true;
    
    $(SPK.HMTL.canvas).append( SPK.VIEWER.renderer.domElement );

    SPK.VIEWER.camera = new THREE.PerspectiveCamera( 40, $(SPK.HMTL.canvas).innerWidth() * 1 / $(SPK.HMTL.canvas).innerHeight(), 1, SPK.GLOBALS.boundingSphere.radius * 100 );

    SPK.VIEWER.camera.position.z = -SPK.GLOBALS.boundingSphere.radius*1.8; 

    SPK.VIEWER.camera.position.y = SPK.GLOBALS.boundingSphere.radius*1.8;
    
    SPK.VIEWER.controls = new OrbitCtrls( SPK.VIEWER.camera, SPK.VIEWER.renderer.domElement );

    SPK.VIEWER.controls.addEventListener( 'change', function () {

      SPKSync.syncCamera(SPK.VIEWER.camera) ;

    });


    // shadow light
    var light = new THREE.DirectionalLight(0xffffff, 1);
    light.castShadow = true;
    light.shadowCameraNear = 0;
    light.shadowCameraFar = SPK.GLOBALS.boundingSphere.radius * 6;
    light.shadowCameraLeft = -SPK.GLOBALS.boundingSphere.radius * 2; 
    light.shadowCameraRight = SPK.GLOBALS.boundingSphere.radius * 2; 
    light.shadowCameraTop = SPK.GLOBALS.boundingSphere.radius * 2; 
    light.shadowCameraBottom = -SPK.GLOBALS.boundingSphere.radius * 2; 
    light.shadowMapWidth = 1024;
    light.shadowMapHeight = 1024;
    light.shadowBias = -0.0000022;
    light.shadowDarkness = 0;
    light.onlyShadow = true;
    
    light.position.set(SPK.GLOBALS.boundingSphere.center.x + SPK.GLOBALS.boundingSphere.radius * 1.7, SPK.GLOBALS.boundingSphere.center.y + SPK.GLOBALS.boundingSphere.radius * 3 ,SPK.GLOBALS.boundingSphere.center.z + SPK.GLOBALS.boundingSphere.radius * 1.7); 

    SPK.SCENE.shadowlight = light;
    SPK.VIEWER.scene.add(light);

    // camera light
    
    SPK.VIEWER.scene.add( new THREE.AmbientLight( 0xD8D8D8 ) );
   
    var flashlight = new THREE.PointLight( 0xffffff, 0.8, SPK.GLOBALS.boundingSphere.radius * 12, 1);
    
    SPK.VIEWER.camera.add( flashlight );
    
    SPK.VIEWER.scene.add( SPK.VIEWER.camera );

    // grids
    
    SPK.makeContext();

    // resize events
    
    $(window).resize( function() { 
      
      SPK.VIEWER.renderer.setSize( $(SPK.HMTL.canvas).innerWidth()-1, $(SPK.HMTL.canvas).innerHeight()-5 ); 
      
      SPK.VIEWER.camera.aspect = ($(SPK.HMTL.canvas).innerWidth()-1) / ($(SPK.HMTL.canvas).innerHeight()-5);
      
      SPK.VIEWER.camera.updateProjectionMatrix();
    
    } );

  }

  SPK.loadInstance = function(key, callback) {
    
    key = key != -1 ? key : SPK.getCurrentKey();

    SPKLoader.load( SPK.GLOBALS.metadata.rootFiles + key + ".json", function (obj) {

      for( var i = 0; i < obj.geometries.length; i++ ) {

        SPKMaker.make( obj.geometries[i], key, function( obj ) { 
          
          SPK.VIEWER.scene.add(obj);

        });

      }

      SPKLogger.addUsedInstance(key);

      SPK.computeBoundingSphere();
      
      if( callback != undefined )

        callback();

    });

  }

  SPK.loadStaticInstance = function() {

    SPKLoader.load( SPK.GLOBALS.metadata.staticGeoFile, function( obj ) {

      for( var i = 0; i < obj.geometries.length; i++ ) {

        SPKMaker.make(obj.geometries[i], "static", function( obj ) { 
          
          // TODO : Make unremovable
          
          obj.removable = false;

          obj.material.opacity = 1;
          
          SPK.VIEWER.scene.add(obj);
          
        });

      }

    });

  }

  SPK.loadInstanceForced = function(key) {

    if( SPK.GLOBALS.currentKey === key) return;

    SPK.removeCurrentInstance();

    var params = key.split(",");
    
    for( var i = 0; i < params.length - 1; i++ ) {

      SPK.GLOBALS.sliders[i].set(params[i]);

    }

    //SPK.GLOBALS.currentKey = key;

    SPK.addNewInstance();

  }

  SPK.render = function() {

    requestAnimationFrame( SPK.render );

    TWEEN.update();

    SPK.VIEWER.renderer.render(SPK.VIEWER.scene, SPK.VIEWER.camera);

  }

  SPK.makeContext = function() {

    var multiplier = 10;

    var planeGeometry = new THREE.PlaneGeometry( SPK.GLOBALS.boundingSphere.radius * multiplier * 2 , SPK.GLOBALS.boundingSphere.radius * multiplier * 2, 2, 2 ); //three.THREE.PlaneGeometry( width, depth, segmentsWidth, segmentsDepth );
    planeGeometry.rotateX( - Math.PI / 2 );
    var planeMaterial = new THREE.MeshBasicMaterial( { color: 0xEEEEEE } ); //0xEEEEEE #D7D7D7
    plane = new THREE.Mesh( planeGeometry, planeMaterial );
    plane.receiveShadow = true;
    plane.position.set(SPK.GLOBALS.boundingSphere.center.x, -0.1, SPK.GLOBALS.boundingSphere.center.z );
    plane.visible = false;

    SPK.VIEWER.scene.add( plane );
    SPK.SCENE.plane = plane;

    if(SPK.GLOBALS.boundingSphere.radius === 0) {
      console.error("ERR: Failed to calculate bounding sphere. This is a known bug and it happens when there's no valid geometry in the scene.");
      //$(".model-name").append(
      $(SPK.HMTL.sliders).html(
      "<br><p style='color: red'>Failed to load model. <strong>Check the console for details (if you feel like a hacker), and send a shout over to <a href='mailto:contact@dimitrie.org?subject=Model " + SPK.GLOBALS.model + " failed to load'>contact@dimitrie.org.</a> so we can look into it. Thanks!</p>")
    } else {
      grid = new THREE.GridHelper( SPK.GLOBALS.boundingSphere.radius * multiplier, SPK.GLOBALS.boundingSphere.radius*multiplier/30);
      grid.material.opacity = 0.15;
      grid.material.transparent = true;
      grid.position.set(SPK.GLOBALS.boundingSphere.center.x, -0.1, SPK.GLOBALS.boundingSphere.center.z );
      grid.setColors( 0x0000ff, 0x808080 ); 
      SPK.VIEWER.scene.add( grid );
      SPK.SCENE.grid = grid;
   }
   
   
    

  }


  /*************************************************
  /   SPK Random functions that should probs go somewehere else
  *************************************************/

  SPK.zoomExtents = function () {

    var r = SPK.GLOBALS.boundingSphere.radius;
    var offset = r / Math.tan(Math.PI / 180.0 * SPK.VIEWER.controls.object.fov * 0.5);
    var vector = new THREE.Vector3(0, 0, 1);
    var dir = vector.applyQuaternion(SPK.VIEWER.controls.object.quaternion);
    var newPos = new THREE.Vector3();
    dir.multiplyScalar(offset * 1.05);
    newPos.addVectors(SPK.GLOBALS.boundingSphere.center, dir);
    SPK.VIEWER.controls.object.position.set(newPos.x, newPos.y, newPos.z);
    SPK.VIEWER.controls.target.set(SPK.GLOBALS.boundingSphere.center.x, SPK.GLOBALS.boundingSphere.center.y, SPK.GLOBALS.boundingSphere.center.z);

  }

  SPK.alignSliders = function () {
    
    return;

  }

  SPK.beep = function () {

    return "boop";

  }


  /*************************************************
  /   SPK INIT
  *************************************************/
    
  SPK.init(wrapper, options);

}

module.exports = SPK;

