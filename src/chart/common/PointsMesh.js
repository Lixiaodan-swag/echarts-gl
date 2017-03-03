var echarts = require('echarts/lib/echarts');
var graphicGL = require('../../util/graphicGL');
var spriteUtil = require('../../util/sprite');
var verticesSortMixin = require('../../util/geometry/verticesSortMixin');


graphicGL.Shader.import(require('text!../../util/shader/points.glsl'));


module.exports = graphicGL.Mesh.extend(function () {
    var geometry = new graphicGL.Geometry({
        dynamic: true,
        sortVertices: true
    });
    var material = new graphicGL.Material({
        shader: graphicGL.createShader('ecgl.points'),
        transparent: true,
        depthMask: false
    });
    geometry.createAttribute('color', 'float', 4, 'COLOR');
    geometry.createAttribute('size', 'float', 1);
    material.shader.enableTexture('sprite');

    this._symbolTexture = new graphicGL.Texture2D({
        image: document.createElement('canvas')
    });
    material.set('sprite', this._symbolTexture);


    echarts.util.extend(geometry, verticesSortMixin);

    return {
        geometry: geometry,
        material: material,
        mode: graphicGL.Mesh.POINTS,
        // 2D or 3D
        is2D: true
    };
}, {

    updateData: function (seriesModel, ecModel, api) {
        var data = seriesModel.getData();
        var geometry = this.geometry;

        var hasItemColor = false;
        var hasItemOpacity = false;
        for (var i = 0; i < data.count(); i++) {
            if (!hasItemColor && data.getItemVisual(i, 'color', true) != null) {
                hasItemColor = true;
            }
            if (!hasItemColor && data.getItemVisual(i, 'opacity', true) != null) {
                hasItemOpacity = true;
            }
        }
        var vertexColor = hasItemColor || hasItemOpacity;
        this.material.shader[vertexColor ? 'define' : 'unDefine']('both', 'VERTEX_COLOR');

        this.material.blend = seriesModel.get('blendMode') === 'lighter'
            ? graphicGL.additiveBlend : null;

        var symbolInfo = this._getSymbolInfo(data);
        var dpr = api.getDevicePixelRatio();
        // TODO arc is not so accurate in chrome, scale it a bit ?.
        symbolInfo.maxSize *= dpr;
        var symbolSize = [];
        if (symbolInfo.aspect > 1) {
            symbolSize[0] = symbolInfo.maxSize;
            symbolSize[1] = symbolInfo.maxSize / symbolInfo.aspect;
        }
        else {
            symbolSize[1] = symbolInfo.maxSize;
            symbolSize[0] = symbolInfo.maxSize * symbolInfo.aspect;
        }

        // TODO image symbol
        // TODO, shadowOffsetX, shadowOffsetY may not work well.
        var itemStyle = seriesModel.getModel('itemStyle.normal').getItemStyle();
        itemStyle.fill = data.getVisual('color');
        var margin = spriteUtil.getMarginByStyle(itemStyle);
        if (hasItemColor) {
            itemStyle.fill = '#ffffff';
            if (margin.right || margin.left || margin.bottom || margin.top) {
                if (__DEV__) {
                    console.warn('shadowColor, borderColor will be ignored if data has different colors');
                }
                ['stroke', 'shadowColor'].forEach(function (key) {
                    itemStyle[key] = '#ffffff';
                });
            }
        }
        spriteUtil.createSymbolSprite(symbolInfo.type, symbolSize, itemStyle, this._symbolTexture.image);

        // TODO
        // var diffX = (margin.right - margin.left) / 2;
        // var diffY = (margin.bottom - margin.top) / 2;
        var diffSize = Math.max(margin.right + margin.left, margin.top + margin.bottom);

        var points = data.getLayout('points');
        var attributes = geometry.attributes;
        attributes.position.init(data.count());
        attributes.size.init(data.count());
        if (vertexColor) {
            attributes.color.init(data.count());
        }
        var positionArr = attributes.position.value;
        var colorArr = attributes.color.value;

        var rgbaArr = [];
        var is2D = this.is2D;
        for (var i = 0; i < data.count(); i++) {
            var i4 = i * 4;
            var i3 = i * 3;
            var i2 = i * 2;
            if (is2D) {
                positionArr[i3] = points[i2];
                positionArr[i3 + 1] = points[i2 + 1];
                positionArr[i3 + 2] = -10;
            }
            else {
                positionArr[i3] = points[i3];
                positionArr[i3 + 1] = points[i3 + 1];
                positionArr[i3 + 2] = points[i3 + 2];
            }

            if (vertexColor) {
                if (!hasItemColor && hasItemOpacity) {
                    colorArr[i4++] = colorArr[i4++] = colorArr[i4++] = 1;
                    colorArr[i4] = data.getItemVisual(i, 'opacity');
                }
                else {
                    var color = data.getItemVisual(i, 'color');
                    var opacity = data.getItemVisual(i, 'opacity');
                    echarts.color.parse(color, rgbaArr);
                    rgbaArr[0] /= 255; rgbaArr[1] /= 255; rgbaArr[2] /= 255;
                    rgbaArr[3] *= opacity;
                    attributes.color.set(i, rgbaArr);
                }
            }

            var symbolSize = data.getItemVisual(i, 'symbolSize');

            attributes.size.value[i] = ((symbolSize instanceof Array
                ? Math.max(symbolSize[0], symbolSize[1]) : symbolSize) + diffSize) * dpr;
        }

        geometry.dirty();
    },

    updateLayout: function (seriesModel, ecModel, api) {
        var data = seriesModel.getData();
        var positionArr = this.geometry.attributes.position.value;
        var points = data.getLayout('points');
        if (this.is2D) {
            for (var i = 0; i < points.length / 2; i++) {
                var i3 = i * 3;
                var i2 = i * 2;
                positionArr[i3] = points[i2];
                positionArr[i3 + 1] = points[i2 + 1];
            }
        }
        else {
            for (var i = 0; i < points.length; i++) {
                positionArr[i] = points[i];
            }
        }
        this.geometry.dirty();
    },

    _getSymbolInfo: function (data) {
        var symbolAspect = 1;
        var differentSymbolAspect = false;
        var symbolType = data.getItemVisual(0, 'symbol') || 'circle';
        var differentSymbolType = false;
        var maxSymbolSize = 0;

        data.each(function (idx) {
            var symbolSize = data.getItemVisual(idx, 'symbolSize');
            var currentSymbolType = data.getItemVisual(idx, 'symbol');
            var currentSymbolAspect;
            if (!(symbolSize instanceof Array)) {
                currentSymbolAspect = 1;
                maxSymbolSize = Math.max(symbolSize, maxSymbolSize);
            }
            else {
                currentSymbolAspect = symbolSize[0] / symbolSize[1];
                maxSymbolSize = Math.max(Math.max(symbolSize[0], symbolSize[1]), maxSymbolSize);
            }
            if (__DEV__) {
                if (Math.abs(currentSymbolAspect - symbolAspect) > 0.05) {
                    differentSymbolAspect = true;
                }
                if (currentSymbolType !== symbolType) {
                    differentSymbolType = true;
                }
            }
            symbolType = currentSymbolType;
            symbolAspect = currentSymbolAspect;
        });

        if (__DEV__) {
            if (differentSymbolAspect) {
                console.warn('Different symbol width / height ratio will be ignored.');
            }
            if (differentSymbolType) {
                console.warn('Different symbol type will be ignored.');
            }
        }

        return {
            maxSize: maxSymbolSize,
            type: symbolType,
            aspect: symbolAspect
        };
    }
});