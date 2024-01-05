---
title: "Diagnosing Outrageously Slow NeoVIM Editor"
date: 2024-01-04
permalink: /posts/2024/01/diagnosing-outrageously-slow-neovim/
tags:
  - vim
  - editor
---

I will be starting my PhD soon. As far as I know, the average time to complete a doctoral degree is about five years in the US. A student writes a lot of documents throughout this period. I have a few days of free time before the start date of my academic activities. It occurred to me that it might be a good time to get more comfortable with LaTeX since I plan to use it a lot. Truthfully, what I can do with LaTeX is pretty limited. In my bachelor years, I've mostly worked with pre-existing templates from the internet. I also find myself googling a lot more than it should be. That can get distracting pretty fast, especially when a deadline is tight.

I was working on setting up a lightweight LaTeX writing workflow. VIM is my all-time favorite text editor. I use VIM keybindings wherever I can. Even when I use a bulkier text editor (VScode) I use Vim extensions to imitate the experience. Since I am on a Windows machine now (because Linux audio drivers don't work in my current Huawei B430 laptop), I wanted to set it up with WSL - windows subsystem for Linux and VIM. I could've gone with the MiKTeX and IDE route. But that doesn't seem as enticing as typing-in-a-terminal, does it? Here's a [medium article link](https://medium.com/@Pirmin/a-minimal-latex-setup-on-windows-using-wsl2-and-neovim-51259ff94734) on how to set up LaTeX on a windows machine with WSL and neovim. 

The primary selling point of a lightweight text editor is that - it is blazing fast to start. But with my VIM configuration file and VimTeX plugin, the startup time for the editor was unacceptable. It took around 3-4 seconds to load the editor. So I had to investigate this issue, find out the source of this delay. 

A good way to do this is starting neovim with --startuptime flag. 
```
neovim --startuptime output.log
```
I did it twice, once with my configuration file (where the issue was) and another time without any configuration. Upon inspecting the logfile, I found that neovim is sourcing a file called clipboard.vim. Here's a snippet of the log file. The clipboard.vim file takes 3218 miliseconds (3.2 seconds) to load! 
```
063.805  000.006: editing files in windows
063.970  000.165: VimEnter autocommands
063.974  000.004: UIEnter autocommands
3283.404  3218.449  3218.449: sourcing /snap/nvim/2819/usr/share/nvim/runtime/autoload/provider/clipboard.vim
3283.499  001.076: before starting main loop
3284.077  000.578: first screen update
3284.083  000.006: --- NVIM STARTED ---
```
The culprit was immediately evident. I had a line in my configuration file related to clipboard. 
```
set clipboard=unnamedplus
```
This sentence makes it so that the VIM copy register is synchronized with operating systems clipboard. If you are interested in understanding, [this video](https://youtu.be/E_rbfQqrm7g?si=d7lG8nbiOBdkrms7) does a pretty good job of explaining. 

Anyhow, I've removed this line from the config, and everything is back on track for now. 