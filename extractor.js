$(function() {
    PIXCEL_CHANNELS = 4;
    PIXCEL_R = 0;
    PIXCEL_G = 1;
    PIXCEL_B = 2;
    PIXCEL_A = 3;
    PIXCEL_BITS = 8;
    PIXCEL_MAX = Math.pow(2, PIXCEL_BITS) - 1;

    jQuery.event.props.push('dataTransfer'); // @@HACK check further jQuery version

    var inputViewerCanvas = $('#input_viewer')[0];
    var inputViewerCtx = inputViewerCanvas.getContext('2d');
    inputViewerCanvas.width = $('#input_viewer').parent().width() / 3;

    var resultViewerCanvas = $('#result_viewer')[0];
    var resultViewerCtx = resultViewerCanvas.getContext('2d');
    resultViewerCanvas.width = $('#result_viewer').parent().width() / 3;

    var inputCanvas = $('#input')[0];
    var inputCtx = inputCanvas.getContext('2d');

    var resultCanvas = $('#result')[0];
    var resultCtx = resultCanvas.getContext('2d');

    var inputHistCanvas = $('#input_histgram')[0];
    var inputHistCtx = inputHistCanvas.getContext('2d');

    var luminance = function(r, g, b, a) {
        return ((r * 0.299) + (g * 0.587) + (b * 0.114)) * a / PIXCEL_MAX;
    };



    var sacaleMean1d = function(fromData, toData, outerSize, innerSize, ratioI, ratioF, outerStep, innerStep, posOuterStep, posInnerStep) {
        var ratioI1 = ratioI - 1;
        var shift = 0;
        var pos = 0;
        var posShift = 0;
        var scale = ratioI + ratioF;
        for (var o = 0; o < outerSize; o++) {
            var mappedI = shift;
            var mappedF = 0.0;
            var pos = posShift;
            for (var i = 0; i < innerSize; i++) {
                var vR = 0, vG = 0, vB = 0, vA = 0;
                var r = 1 - mappedF;
                vR += fromData[mappedI + PIXCEL_R] * r;
                vG += fromData[mappedI + PIXCEL_G] * r;
                vB += fromData[mappedI + PIXCEL_B] * r;
                vA += fromData[mappedI + PIXCEL_A] * r;
                for (var c = 0; c < ratioI1; c++) {
                    mappedI += innerStep;
                    vR += fromData[mappedI + PIXCEL_R];
                    vG += fromData[mappedI + PIXCEL_G];
                    vB += fromData[mappedI + PIXCEL_B];
                    vA += fromData[mappedI + PIXCEL_A];
                }
                mappedF += ratioF;
                if (mappedF >= 1) {
                    mappedF -= 1;
                    mappedI += innerStep;
                    vR += fromData[mappedI + PIXCEL_R];
                    vG += fromData[mappedI + PIXCEL_G];
                    vB += fromData[mappedI + PIXCEL_B];
                    vA += fromData[mappedI + PIXCEL_A];
                }
                mappedI += innerStep;
                vR += fromData[mappedI + PIXCEL_R] * mappedF;
                vG += fromData[mappedI + PIXCEL_G] * mappedF;
                vB += fromData[mappedI + PIXCEL_B] * mappedF;
                vA += fromData[mappedI + PIXCEL_A] * mappedF;
                pos += posInnerStep;
                toData[pos + PIXCEL_R] = Math.round(vR / scale);
                toData[pos + PIXCEL_G] = Math.round(vG / scale);
                toData[pos + PIXCEL_B] = Math.round(vB / scale);
                toData[pos + PIXCEL_A] = Math.round(vA / scale);
            }
            shift += outerStep;
            posShift += posOuterStep;
        }
    };

    var resize = function(from, to) {
        var fromWidth = from.width;
        var fromHeight = from.height;
        var toWidth = to.width;
        var toHeight = to.height;
        var widthRatioI = Math.floor(fromWidth /toWidth);
        var widthRatioF = (fromWidth / toWidth) - widthRatioI;
        var heightRatioI = Math.floor(fromHeight / toHeight);
        var heightRatioF = (fromHeight / toHeight) - heightRatioI;
        var fromData = from.data;
        var toData = to.data;
        sacaleMean1d(fromData, fromData, fromHeight, toWidth, widthRatioI, widthRatioF, fromWidth * PIXCEL_CHANNELS, PIXCEL_CHANNELS, fromWidth * PIXCEL_CHANNELS, PIXCEL_CHANNELS);
        sacaleMean1d(fromData, toData, toWidth, toHeight, heightRatioI, heightRatioF, PIXCEL_CHANNELS, fromWidth * PIXCEL_CHANNELS, PIXCEL_CHANNELS, toWidth * PIXCEL_CHANNELS);
    };


    var createHistgram  = function(data, about) {
        var result = new Array(Math.pow(2, PIXCEL_BITS));
        var resultLen = result.length;
        for (var i = 0; i < resultLen; i++) {
            result[i] = 0;
        }
        var dataLen = data.length;
        for (var i = 0; i < dataLen; i += PIXCEL_CHANNELS) {
            var v = about(data[i + PIXCEL_R], data[i + PIXCEL_G], data[i + PIXCEL_B], data[i + PIXCEL_A]);
            result[Math.round(v)]++;
        }
        return result;
    };



    var drawHistgram = function(histgram, image, limit) {
        var histLen = histgram.length;
        var avg = 0;
        for (var i = 0; i < histLen; i++) {
            avg += histgram[i];
        }

        var imgHeight = image.height;
        var imgWidth = image.width;
        var arrayWidth = imgWidth * PIXCEL_CHANNELS;
        var max = avg / histLen * limit;
        var data = image.data;
        for (var i = 0; i < histLen; i++) {
            var lineHeight = imgHeight * (histgram[i] / max);
            var pos = i * PIXCEL_CHANNELS;
            for (var v = 0; v < imgHeight; v++) {
                pos += arrayWidth;
                if (imgHeight - v > lineHeight) {
                    var color = PIXCEL_MAX;
                } else {
                    var color = 0;
                }
                data[pos + PIXCEL_R] = color;
                data[pos + PIXCEL_G] = color;
                data[pos + PIXCEL_B] = color;
                data[pos + PIXCEL_A] = PIXCEL_MAX;
            }
        }
    };

    var drawHistgramThreshold = function(ctx, position, color) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.moveTo(position, 0);
        ctx.lineTo(position, ctx.canvas.height);
        ctx.stroke();
    };

    var drawImage = function (img) {
        inputCanvas.width = resultCanvas.width = img.width;
        inputCanvas.height = resultCanvas.height = img.height;
        inputCtx.drawImage(img, 0, 0, img.width, img.height);

        // draw on viwer
        var ratio = (img.height / img.width);
        inputViewerCanvas.height = resultViewerCanvas.height = inputViewerCanvas.width * (img.height / img.width);
        var inputViewerImg = inputViewerCtx.createImageData(inputViewerCanvas.width, inputViewerCanvas.height);
        resize(inputCtx.getImageData(0, 0, inputCanvas.width, inputCanvas.height), inputViewerImg);
        inputViewerCtx.putImageData(inputViewerImg, 0, 0);

        // draw histgram
        var inputData = inputCtx.getImageData(0, 0, inputCanvas.width, inputCanvas.height).data;
        var inputHist = createHistgram(inputData, luminance);
        var inputHistImg = inputHistCtx.createImageData(inputHistCanvas.width, inputHistCanvas.height);
        drawHistgram(inputHist, inputHistImg, 10); // 10?
        inputHistCtx.putImageData(inputHistImg, 0, 0);

        // calc threshold
        var cutLeft = 0;
        var cutRight = PIXCEL_MAX;
        var maxDelta = 0; // // 63?
        for (var i = 2; i < PIXCEL_MAX; i++) {
            if (inputHist[i] -inputHist[i - 2] > maxDelta){
                cutLeft = i;
                break;
            }
        }
        drawHistgramThreshold(inputHistCtx, cutLeft, '#f00');
        var barrier = Math.max.apply(null, inputHist);
        for (var i = 253; i >= 0; i--) {
            if (inputHist[i] >= barrier){
                cutRight = i;
                break;
            }
        }
        cutRight -= 0;
        drawHistgramThreshold(inputHistCtx, cutRight, '#0f0');

        // draw result
        var cutRange = 256 - cutLeft - (256 - cutRight);
        var resultImg = resultCtx.createImageData(resultCanvas.width, resultCanvas.height);
        var resultData = resultImg.data;
        var arrySize = resultCanvas.width * resultCanvas.height * PIXCEL_CHANNELS;
        for (var i = 0; i < arrySize; i += PIXCEL_CHANNELS) {
            var l = luminance(inputData[i + PIXCEL_R], inputData[i + PIXCEL_G], inputData[i +PIXCEL_B], inputData[i + PIXCEL_A]);
            l = (l - cutLeft) * 256 / cutRange;
            resultData[i + PIXCEL_R] = resultData[i + PIXCEL_G] = resultData[i + PIXCEL_B] = l;
            resultData[i + PIXCEL_A] = PIXCEL_MAX;
        }
        resultCtx.putImageData(resultImg, 0, 0);

        var resultViewerImg = resultViewerCtx.createImageData(resultViewerCanvas.width, resultViewerCanvas.height);
        resize(resultImg, resultViewerImg);
        resultViewerCtx.putImageData(resultViewerImg, 0, 0);

    };


    var readAndDrawImage = function(file) {
        var reader = new FileReader();
        reader.onload = function (e) {
            var img = new Image();
            img.onload = function() {drawImage(img);};
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    // bind drag and drop
    $("html").bind("drop", function(e){
        e.stopPropagation();
        e.preventDefault(); // kill browser default behaviors
        var file = e.dataTransfer.files[0];
        readAndDrawImage(file);
    }).bind("dragenter dragover", false);

    $("#choose_input").change(function(e) {
        var file = this.files[0];
        readAndDrawImage(file);
    });

    $("#download_result").click(function(e) {
        resultCanvas.toDataURL();
    });


});