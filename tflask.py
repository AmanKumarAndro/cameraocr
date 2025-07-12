from flask import Flask, request, jsonify
from ultralytics import YOLO
import numpy as np
import base64
from PIL import Image
import io

# Initialize Flask app and YOLOv9 TFLite model
app = Flask(__name__)
model = YOLO('assets/anpr2_yolov9_int8.tflite')  # make sure this path is correct

# No pytesseract here
@app.route('/detect', methods=['POST'])
def detect_plate():
    try:
        print('Processing image...')
        data = request.get_json()
        image_data = base64.b64decode(data['image'])
        pil_image = Image.open(io.BytesIO(image_data)).convert('RGB')
        image_np = np.array(pil_image)

        # Run detection
        results = model.predict(image_np, imgsz=640, conf=0.5, int8=True)

        boxes_list = []
        for result in results:
            for box in result.boxes.xyxy:
                x1, y1, x2, y2 = map(int, box)
                boxes_list.append([x1, y1, x2, y2])

        print('Detection completed.')
        print(boxes_list)

        return jsonify({
            "success": True,
            "boxes": boxes_list
        })

    except Exception as e:

        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
