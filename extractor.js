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

    var state = {};
    var saveResult = function(img) {
        state["result"] = img;
    };

    // L(t) = sinc(d) * sinc(d/a) (|d| <= n)
    //      = 0                   (|d|  > n)
    var scaleLanzcos = function(from, to, n) {
        var fromWidth = from.width;
        var fromHeight = from.height;
        var toWidth = to.width;
        var toHeight = to.height;
        var ratioX = fromWidth /toWidth;
        var ratioY = fromHeight / toHeight;
        var fromData = from.data;
        var toData = to.data;

        var lowpassX = ratioX > 1 ? ratioX : 1;
        var lowpassY = ratioY > 1 ? ratioY : 1;
        var sampleNumX = ~~(n * 2 * lowpassX);
        var sampleNumY = ~~(n * 2 * lowpassY);
        var stepKernelX = Math.PI / lowpassX;
        var stepKernelY = Math.PI / lowpassY;
        var leftMostLX = ~~(sampleNumX / 2) - 1;
        var leftMostLY = ~~(sampleNumY / 2) - 1;
        var phaiXs = new Array(toWidth);

        var pos = 0;
        for (var y = 0; y <toHeight; y++) {
            var mappedY = y * ratioY + 0.5; // should be - 0.5, but shifting + 1 to avoid negative number
            var nY = ~~mappedY;
            var dY = mappedY - nY;
            var leftMostY = (lowpassY > 1 || dY > 0.5) ? leftMostLY : leftMostLY + 1;
            var phaiY = new Array(sampleNumY);
            var dp =  Math.PI / lowpassY * (- dY - leftMostY);
            for (var i = 0; i < sampleNumY; i++, dp += stepKernelY) {
                var dpn = dp / n;
                phaiY[i] = Math.sin(dp) * Math.sin(dpn) / dp / dpn;
                if (isNaN(phaiY[i])) phaiY[i] = 1;
            }
            var indexYStart = nY - leftMostY - 1; //  - 1 restores mappedY shifting
            for (var x = 0; x < toWidth; x++, pos += PIXCEL_CHANNELS) {
                var mappedX =  x * ratioX + 0.5; // same as Y
                var nX = ~~mappedX;
                var dX = mappedX - nX;
                var leftMostX = (lowpassX > 1 || dX > 0.5) ? leftMostLX : leftMostLX + 1;
                if (y == 0) {
                    var phaiX = new Array(sampleNumX);
                    var dp =  Math.PI / lowpassX * (- dX - leftMostX);
                    for (var i = 0; i < sampleNumX; i++, dp += stepKernelX) {
                        var dpn = dp / n;
                        phaiX[i] = Math.sin(dp) * Math.sin(dpn) / dp / dpn;
                        if (isNaN(phaiX[i])) phaiX[i] = 1;
                    }
                    phaiXs[x] = phaiX;
                } else {
                    var phaiX = phaiXs[x];
                }
                var r = 0; var g = 0; var b = 0;
                var wSum = 0;
                var indexXStart = nX - leftMostX - 1;// - 1 restores mappedX shifting
                var indexY = indexYStart;
                for (var cY = 0; cY < sampleNumY; cY++, indexY++) {
                    if (indexY < 0 || indexY >= fromHeight) continue;
                    var indexX = indexXStart;
                    for (var cX = 0; cX < sampleNumX; cX++, indexX++) {
                        if (indexX < 0 || indexX >= fromWidth) continue;
                        var w = phaiX[cX] * phaiY[cY];
                        var fromPos = (indexX + indexY * fromWidth) * PIXCEL_CHANNELS;
                        wSum += w;
                        r += fromData[fromPos + PIXCEL_R] * w;
                        g += fromData[fromPos + PIXCEL_G] * w;
                        b += fromData[fromPos + PIXCEL_B] * w;
                    }
                }
                toData[pos + PIXCEL_R] = Math.round(r / wSum);
                toData[pos + PIXCEL_G] = Math.round(g / wSum);
                toData[pos + PIXCEL_B] = Math.round(b / wSum);
            }
        }
        return toData;
    };

    var scaleLanzcosAsync = function(from, to, n, callback) {
        setTimeout(function() {
            callback(scaleLanzcos(from, to, n));
        }, 0);
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
        var inputImg = inputCtx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
        var inputData = inputImg.data;

        // draw on viwer
        var ratio = (img.height / img.width);
        inputViewerCanvas.height = resultViewerCanvas.height = inputViewerCanvas.width * (img.height / img.width);
        var inputViewerImg = inputViewerCtx.createImageData(inputViewerCanvas.width, inputViewerCanvas.height);
        scaleLanzcosAsync(inputImg, inputViewerImg, 2,
                     function() {
                         arrySize = inputViewerCanvas.width * inputViewerCanvas.height * PIXCEL_CHANNELS;
                         for (var i = 0; i < arrySize; i += PIXCEL_CHANNELS) {
                             inputViewerImg.data[i + PIXCEL_A] = PIXCEL_MAX;
                         }
                         inputViewerCtx.putImageData(inputViewerImg, 0, 0);
                     });

        // draw histgram
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

        // prepare result
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
        saveResult(resultImg);

        // draw result viewer
        var resultViewerImg = resultViewerCtx.createImageData(resultViewerCanvas.width, resultViewerCanvas.height);
        scaleLanzcosAsync(resultImg, resultViewerImg, 2, function() {
            var resultViewerData = resultViewerImg.data;
            arrySize = resultViewerCanvas.width * resultViewerCanvas.height * PIXCEL_CHANNELS;
            for (var i = 0; i < arrySize; i += PIXCEL_CHANNELS) {
                resultViewerData[i + PIXCEL_A] = PIXCEL_MAX;
            }
            resultViewerCtx.putImageData(resultViewerImg, 0, 0);
        });
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
        resultCtx.putImageData(state["result"], 0, 0);
        document.location = resultCanvas.toDataURL();
    });
});