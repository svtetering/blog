---
title: The (possibly) simplest way to screenshot your Linux framebuffer with C
layout: post
tags: posts
date: 2021-02-10
excerpt: Converting your Linux framebuffer to an uncompressed bitmap file, just by adding a header.
---

First of all, welcome to my blog! I'm really happy to have you here!

So I was playing around with Linux with one of my friends the other day, when we stumbled upon the framebuffer device (`/dev/fb*`), which represents the area of pixels that is seen when you are in the linux console. We discovered that this device was just an ordinary character device, meaning it is possible to read from, and write data to it as if it were a string of characters. We tried writing random bytes to the screen using `cp /dev/urandom /dev/fb0`. This produced some... strange, but cool results (try it!).

Next, we tried writing from the framebuffer to a file, using `cp /dev/fb0 frame`. However, this file could not be opened by an image viewer. We noticed that the size of the file was just big enough to store the data for all pixels (`width * height * bytes per pixel` bytes), so if we could somehow save this data in a raw image format, we could display the framebuffer as an image. We decided to try this idea out and started writing a program that could convert the raw framebuffer data to a bitmap file.

But first, *what is a bitmap file?*

The format of BMP files is described very well on [Wikipedia](https://en.wikipedia.org/wiki/BMP_file_format). The simplest form of a BMP file has the following:
- A bitmap file header
- A DIB header (bitmap information header)
- A pixel array (bitmap data)

The bitmap file header always follows the same format:
- 2 bytes: Magic bytes, defining the file type
- 4 bytes: The size of the file
- 4 bytes: Reserved bytes that can be left zero
- 4 bytes: The starting address of the pixel array

After the bitmap file header, the DIB header (bitmap information header) follows. There are multiple types of DIB headers, and at first we decided to use the smallest one (BITMAPCOREHEADER), but I later discovered that Windows's image viewer can't actually understand this format, so I rewrote our program to use BITMAPINFOHEADER.

The format of BITMAPINFOHEADER is as follows:
- 4 bytes: The size of the DIB header (40 bytes)
- 4 bytes: The width of the bitmap
- 4 bytes: The height of the bitmap
- 2 bytes: The number of color planes (must be 1)
- 2 bytes: The number of bits per pixel
- 4 bytes: The compression method (left 0 for no compression method in our case)
- 4 bytes: The size of the bitmap array in bytes
- 4 bytes: The horizontal resolution (pixel per metre, left 0 in our program because this didn't seem to be neccesary)
- 4 bytes: The vertical resolution (pixel per metre, also left 0 because of the same reason)
- 4 bytes: The number of colors in the palette (left 0 for default in our case)
- 4 bytes: The number of important colors used, generally ignored

The pixel array, finally, contains the raw pixel data. The size of each row of pixels in bytes has to be divisible by 4. This can be achieved by adding additional bytes with any value.

With all this knowledge, we can write a small C program that writes all of the header data, appends the pixel data from `/dev/fb*`, and writes the result to a file. So, here's how we did it!

Starting off with the code responsible for writing the headers:

```c
void write_bmp_header(char* buffer, int width, int height, int bytes_per_pixel, size_t image_size) {
    size_t file_size = image_size + 52;

    // Set all bytes in the header to 0
    memset(buffer, 0, 52);

    // Magic number: BM
    buffer[0x00] = 0x42;
    buffer[0x01] = 0x4D;

    // File size
    char* file_size_header = &buffer[2];
    memcpy(file_size_header, (uint32_t*)&file_size, sizeof(uint32_t));

    // Pixel data starting address
    buffer[0x0A] = 0x36;

    // Start of DIB header BITMAPINFOHEADER
    buffer[0x0E] = 40;
    
    char* image_width_dib = &buffer[0x12];
    char* image_height_dib = &buffer[0x16];
    memcpy(image_width_dib, &width, sizeof(int));
    memcpy(image_height_dib, &height, sizeof(int));

    buffer[0x1A] = 1;
    buffer[0x1C] = bytes_per_pixel * 8;
    buffer[0x1E] = 0;

    char* image_size_dib = &buffer[0x22];
    memcpy(image_size_dib, (uint32_t*)&image_size, sizeof(uint32_t));

    char* horizontal_image_res_dib = &buffer[0x26];
    char* vertical_image_res_dib = &buffer[0x2A];
    int horizontal_image_res = 0;
    int vertical_image_res = 0;
    memcpy(horizontal_image_res_dib, &horizontal_image_res, sizeof(int));
    memcpy(vertical_image_res_dib, &vertical_image_res, sizeof(int));

    char* num_colors_dib = &buffer[0x2E];
    char* num_imp_colors_dib = &buffer[0x32];
    uint32_t num_colors = 0;
    uint32_t num_imp_colors = 0;
    memcpy(num_colors_dib, &num_colors, sizeof(uint32_t));
    memcpy(num_colors_dib, &num_imp_colors, sizeof(uint32_t));
}
```

The `ioctl(2)` system call can be used to retrieve information about the framebuffer, such as the width, the height and the amount of bits per pixel. It returns a [struct fb_var_screeninfo](https://www.kernel.org/doc/html/latest/fb/api.html#screen-information). This is done in our `main()` function, which I will show later.

Because the framebuffer may contain more pixels than are shown on a display, I made the program capture only the visible part of the framebuffer. To do this, the program uses `lseek(2)` to skip excess pixels on every row, while reading from the framebuffer.

You may also notice that the below code leaves an amount of `padding_bytes` bytes untouched after writing every row. This is because the BMP file format requires the size of all pixel rows to be divisible by 4, as stated earlier. The value of `padding_bytes` is passed from our `main()` function.

```c
void read_framebuffer_pixels(char* pixel_data, int framebuffer_fd, struct fb_var_screeninfo vinfo, int bytes_per_pixel, int padding_bytes) {
    // Skip vinfo.yoffset rows
    lseek(framebuffer_fd, vinfo.yoffset * vinfo.xres_virtual * bytes_per_pixel, SEEK_CUR);
    for (int y = 0; y < vinfo.yres; y++) {
        // Skip vinfo.xoffset columns
        lseek(framebuffer_fd, vinfo.xoffset * bytes_per_pixel, SEEK_CUR);

        char* row = pixel_data + y * vinfo.xres * bytes_per_pixel + y * padding_bytes;
        int succ = read(framebuffer_fd, row, vinfo.xres * bytes_per_pixel);
        if (succ == -1) {
            perror("read");
            exit(1);
        }

        // Skip horizontal part of framebuffer that isn't shown on screen
        lseek(framebuffer_fd, (vinfo.xres_virtual - vinfo.xres - vinfo.xoffset) * bytes_per_pixel, SEEK_CUR);
    }
}
```

And finally, our main function, which reads command line arguments, opens the framebuffer file, calls the two functions from above, and writes the generated buffer to a file:

```c
int main(int argc, char** argv) {
    char* framebuffer_path = "/dev/fb0";
    char* output_path = "output.bmp";
    bool capture_full_virtual_framebuffer = false;

    // Parse command-line arguments
    for (int i = 1; i < argc; i++) {
        char* argument = argv[i];
        if (strcmp(argument, "--help") == 0) {
            printf("USAGE: fbscreenshot [OPTIONS]\nOPTIONS:\n --help    - Show this help message\n -f [path] - The path of the framebuffer to read from\n -o [path] - The path of the bitmap file that is exported\n -v        - Copy full virtual framebuffer\n");
            return 0;
        }
        if (strcmp(argument, "-f") == 0) {
            if (i + 1 == argc) {
                fprintf(stderr, "-f: No path given\n");
                return 1;
            }
            i++;
            framebuffer_path = argv[i];
        } else if (strcmp(argument, "-o") == 0) {
            if (i + 1 == argc) {
                fprintf(stderr, "-o: No path given\n");
                return 1;
            }
            i++;
            output_path = argv[i];
        } else if (strcmp(argument, "-v") == 0) {
            capture_full_virtual_framebuffer = true;
        }
    }

    int framebuffer_fd = open(framebuffer_path, O_RDONLY);
    if (framebuffer_fd == -1) {
        perror("open");
        return 1;
    }

    // Get information about the framebuffer using ioctl()
    struct fb_var_screeninfo vinfo;
    int succ = ioctl(framebuffer_fd, FBIOGET_VSCREENINFO, &vinfo);
    if (succ == -1) {
        perror("ioctl");
        return 1;
    }

    int capture_width = capture_full_virtual_framebuffer ? vinfo.xres_virtual : vinfo.xres;
    int capture_height = capture_full_virtual_framebuffer ? vinfo.yres_virtual : vinfo.yres;
    int bytes_per_pixel = vinfo.bits_per_pixel / 8;
    int padding_bytes = (4 - (capture_width * bytes_per_pixel) % 4) % 4;
    
    size_t image_size = capture_width * capture_height * bytes_per_pixel + padding_bytes * capture_height;
    size_t file_size = image_size + 54;

    char data[file_size];
    write_bmp_header(&data[0], capture_width, -capture_height, bytes_per_pixel, image_size);

    if (capture_full_virtual_framebuffer) {
        // Adjust boundaries so read_framebuffer_pixels() reads the whole framebuffer
        vinfo.xoffset = 0;
        vinfo.yoffset = 0;
        vinfo.xres = vinfo.xres_virtual;
        vinfo.yres = vinfo.yres_virtual;
    }
    char* pixel_data = &data[0x36];
    read_framebuffer_pixels(pixel_data, framebuffer_fd, vinfo, bytes_per_pixel, padding_bytes);

    int output_fd = open(output_path, O_WRONLY | O_CREAT, 0644);
    if (output_fd == -1) {
        perror("open");
        return 1;
    }
    write(output_fd, data, sizeof(data));

    close(framebuffer_fd);
    close(output_fd);
}
```

And that's it! Now let's compile and run the program!

![](/img/demo.png)

Voilà! A viewable image of our Linux framebuffer! Now, how could we actually use this to capture anything interesting? Well, we can run some program, wait a bit, and then run our screenshot program as a background process! Let's try capturing a still image of [cmatrix](https://github.com/abishekvashok/cmatrix) using this approach. Running the command `((sleep 3 && ./fbscreenshot) &) && cmatrix` gives us the following good-looking image:

![](/img/cmatrix.png)

Would you look at that :')

Thanks for reading the very first post on this website. I hope you enjoyed it! I would greatly appreciate any feedback, so if you would like to reach out to me, you can contact me at <steven@tikveel.nl>. Also, thanks to my friend for coming up with the idea of converting the framebuffer into a viewable image file, I think it was really cool!

P.S.: If you want to play around with the code, you can download it from <https://github.com/svtetering/fbscreenshot>. Oh, and feel free to point it out if you notice anything I've done wrong :) However, keep in mind that this project was just a small hack that I decided to do. I don't intend to transform this into a professional, full-fledged program to make screenshots with. That's all, have a great day! :D