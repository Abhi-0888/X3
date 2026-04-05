# YOLOv8/v9/11 Model Guide by Datature

This guide is for carrying out predictions using exported YOLOv8/v9/11 models trained with Datature.


## Requirements

To use GPU, the CUDA requirement is >= 11.2. 

Some of the package versions specified may require Python < 3.11.

Install the required packages using:

`pip3 install --force-reinstall -r requirements.txt`


## Making Predictions

The `predict.py` file can be run as follows:

```shell
python3 predict.py \
    -i input_folder_path \
    -m model_path \
    -l label_map_path \
    -o output_folder_path \
    -t threshold 
```

**input_folder_path** refers to the path to the folder where the images for prediction are stored.

**model_path** refers to the path to saved_model (not the saved_model directory)

**threshold** refers to the threshold value in range (0.0, 1.0) for the prediction score. Only predictions with scores above the threshold value will be shown on the output image. 

**output_folder_path** refers to the path to the folder where the output images after prediction are to be stored. Do note that the output image names will be the same as the input image names so this should not be the same folder as the input folder.

**label_map_path** refers to the path to the label map file (not the label map file directory)


## Documentation

For more information around other training settings, please refer to [Datature's documentation](https://developers.datature.io/docs/model-selection-and-options)
