#!/usr/bin/env python
# -*-coding:utf-8 -*-
'''
  ████
██    ██   Datature
  ██  ██   Powering Breakthrough AI
    ██

@File    :   predict.py
@Author  :   Marcus Neo
@Version :   1.0
@Contact :   developers@datature.io
@License :   Apache License 2.0
@Desc    :   Simple predictor script for YOLOv8/v9/11 models.
'''
import argparse
import os
import shutil

import cv2
from ultralytics import YOLO

HEIGHT, WIDTH = 640, 640


def predict(model, input_path, threshold):
    model.predict(source=input_path,
                  conf=threshold,
                  imgsz=[WIDTH, HEIGHT],
                  save=True,
                  task='detect')


parser = argparse.ArgumentParser(
    prog="YOLOv8/v9/11 Predictor by Datature",
    description="Predictor to Predict with YOLOv8/v9/11 Model.")
parser.add_argument("-i",
                    "--input_folder_path",
                    help="Path to folder with images to use for prediction")
parser.add_argument("-m", "--model_path", help="Path to model")
parser.add_argument("-t", "--threshold", help="Threshold for predictions")


def main():
    args = parser.parse_args()
    input_path = args.input_folder_path
    model_path = args.model_path
    threshold = float(args.threshold)

    model = YOLO(model_path, task='detect')

    hidden_folder_name = ".datature_tmp_resized"
    tmp_resized_path = os.path.join(input_path, hidden_folder_name)
    if not os.path.exists(tmp_resized_path):
        os.mkdir(tmp_resized_path)
    for image_path in sorted(os.listdir(input_path)):
        if image_path == hidden_folder_name:
            continue
        try:
            original_image = cv2.imread(os.path.join(input_path, image_path))
            image = cv2.resize(original_image, (WIDTH, HEIGHT))
        except Exception:
            print(f"Error reading {image_path}")
            continue
        cv2.imwrite(os.path.join(tmp_resized_path, image_path), image)
    predict(model=model, input_path=tmp_resized_path, threshold=threshold)
    shutil.rmtree(tmp_resized_path)


if __name__ == "__main__":
    main()
