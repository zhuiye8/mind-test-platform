package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
)

func main() {
	todoList := []string{}
	tools(todoList)
}

func tools(todoList []string) []string {
	scanner := bufio.NewScanner(os.Stdin)
	for {
		fmt.Println("--- 待办事项列表 ---\n1. 添加新事项\n2. 查看所有事项\n3. 退出程序\n请输入你的选择: ")
		scanner.Scan()
		input := scanner.Text()
		switch input {
		case "1":
			todoList = add(todoList)
		case "2":
			view(todoList)
		case "3":
			os.Exit(0)
		default:
			fmt.Println("输入的数字不合法，请重新输入")
		}
	}
}

func add(todoList []string) []string {
	fmt.Println("请输入待办事项: ")
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Scan()
	input := scanner.Text()
	todoList = append(todoList, input)
	fmt.Printf("添加成功！当前待办事项是 %v\n", todoList)
	return todoList
}

func view(todoList []string) {
	fmt.Printf("当前待办事项是 %v\n", todoList)
}

func delete(todoList []string) {
	fmt.Printf("当前待办列表是 %v\n 请问需要删除哪一个", todoList)
	for {
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Scan()
		input := scanner.Text()
		index, err := strconv.Atoi(input)
		if err == nil {
			if index > 0 && index <= len(todoList) {
				//待实现
				break
			} else {
				fmt.Println("输入的数字不合法，请重新输入")
			}
		} else {
			fmt.Println("输入的不是数字，请重新输入")
		}
	}
}
